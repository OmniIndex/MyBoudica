<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Service;

use OCP\Calendar\ICreateFromString;
use OCP\Calendar\IManager as ICalendarManager;
use OCP\Constants;
use OCP\IDBConnection;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;

/**
 * Detects meeting/scheduling requests inside a conversation summary and,
 * once a user confirms, writes the event to that user's own Nextcloud
 * calendar with the rest of the Talk room listed as attendees.
 *
 * Extraction deliberately does NOT make its own call to Boudica. An
 * earlier version asked for a separate JSON-formatted extraction via
 * BoudicaService::ask() — dropped after three real logged responses each
 * came back describing a different fabricated conversation (different
 * fake participant names each time, none matching the real transcript
 * sent). The ordinary chat-summary call — same ask() method, same
 * inference_type, a structurally simpler prompt — was independently
 * confirmed accurate for the same real conversations, which rules out
 * inference_type/RAG as a blanket explanation: something about a bespoke
 * JSON-extraction prompt specifically doesn't ground reliably on this
 * backend. Rather than keep chasing that, extraction now just
 * regex-parses the summary text that's already been generated and shown
 * to the user (extractFromProse()) — one fewer unreliable network call,
 * and it only ever sees text already confirmed correct.
 *
 * Deliberately does NOT attempt real CalDAV scheduling (iTip REQUEST/RSVP)
 * — ICreateFromString::createFromString() writes straight to the CalDAV
 * backend, bypassing Sabre's scheduling plugin (that only runs on actual
 * DAV HTTP requests), so attendees added here will show up on the
 * organizer's event but will NOT get an automatic "invite" email from
 * Nextcloud itself. TranscriptEmailService::sendMeetingInviteNotification()
 * sends a plain heads-up email instead (wired up from
 * TalkBotInvokeListener::handleMeetingConfirm()) — good enough for "let
 * them know", not a substitute for a real accept/decline flow. If that's
 * needed later, it means building a proper iTip REQUEST message, which is
 * a materially bigger feature.
 *
 * NOT YET CONFIRMED against a real instance with the Calendar app enabled:
 * findWritableCalendar() assumes every calendar returned by
 * IManager::getCalendarsForPrincipal() that implements ICreateFromString
 * also implements getPermissions() (guarded with method_exists, so it
 * degrades to "assume writable" rather than fatal if not) and that the
 * built ICS string is accepted as-is by createFromString(). Verify end to
 * end — confirm a meeting, check the event actually lands in the target
 * user's Nextcloud Calendar app — before relying on this in production.
 */
class CalendarSuggestionService {

    /**
     * How long a stored suggestion stays confirmable. Long enough to cover
     * both callers: the interactive '@boudica summarize' path (someone's
     * live in the conversation, would reply within minutes) and the
     * background digest path (DigestService emails the prompt — the
     * recipient may not read it for hours).
     */
    private const PENDING_EXPIRY_SECONDS = 86400;

    public function __construct(
        private ICalendarManager $calendarManager,
        private IDBConnection $db,
        private IUserManager $userManager,
        private LoggerInterface $logger,
    ) {
    }

    /**
     * Pulls explicit meeting/scheduling requests out of an already-generated
     * Boudica summary. See the class docblock for why this is a synchronous
     * regex scan (extractFromProse()) rather than a second call to Boudica.
     * Never throws — any parse failure just yields an empty array, since
     * this runs as a side effect of summarizing and must never break that
     * flow.
     *
     * @return array<int, array{title:string, date:string, time:?string, quote:string, proposedBy:?string}>
     */
    public function extractMeetingRequests(string $summaryText): array {
        return $this->extractFromProse($summaryText);
    }

    /**
     * Regex parser tuned to the "Decisions Made / Action Items" template
     * BoudicaService::ask() actually returns for a summarization request
     * (see the class docblock). Scans line by line for a meeting/call/
     * appointment mention that also
     * contains a date — ISO ("2026-08-18") or prose ("August 18, 2026"),
     * both observed from the real backend — plus an optional time and an
     * optional "proposed by X" / "(by: X)" attribution. Deliberately
     * requires both a trigger word AND a real date on the SAME line, so
     * unrelated dates (e.g. today's date, quoted elsewhere) don't produce
     * false positives.
     *
     * @return array<int, array{title:string, date:string, time:?string, quote:string, proposedBy:?string}>
     */
    private function extractFromProse(string $raw): array {
        $datePattern = '\d{4}-\d{2}-\d{2}'
            . '|(?:January|February|March|April|May|June|July|August|September|October|November|December)'
            . '\s+\d{1,2},?\s+\d{4}';
        // Covers both forms actually observed from the real backend:
        // 12h with AM/PM ("10:00 AM") and 24h with a timezone label instead
        // ("11:00 UTC", "3 PM UTC"). (?-i:...) forces the timezone-label
        // alternative to stay case-SENSITIVE even though the overall match
        // below runs case-insensitive (for AM/PM) — otherwise a random
        // trailing lowercase word ("11:00 to walk through...") could get
        // swept in and mistaken for a timezone abbreviation.
        $timePattern = '\d{1,2}:\d{2}\s*(?:[AaPp][Mm])?(?:\s*(?-i:UTC|GMT|[A-Z]{2,5}))?'
            . '|\d{1,2}\s*[AaPp][Mm](?:\s*(?-i:UTC|GMT|[A-Z]{2,5}))?';

        $requests = [];
        foreach (preg_split('/\r?\n/', $raw) as $line) {
            if (trim($line) === '' || !preg_match('/\b(meeting|call|appointment|event|calendar|schedule)\b/i', $line)) {
                continue;
            }

            // "(By: 2026-08-17)" is the summarizer's own deadline for
            // completing the action item, not the meeting date — matched
            // against the line with that clause stripped so a "By:" date
            // can never be picked up instead of (or ahead of) the actual
            // proposed date. proposedBy below still searches the original
            // $line, not this stripped copy.
            $searchLine = preg_replace('/\(By:\s*[^)]*\)/i', '', $line);

            if (!preg_match('/(' . $datePattern . ')/i', $searchLine, $dateMatch)) {
                continue;
            }

            $date = $this->normalizeDate($dateMatch[1]);
            if ($date === null) {
                continue; // strtotime couldn't make sense of it — skip rather than guess
            }

            $time = null;
            if (preg_match('/(' . $timePattern . ')/i', $searchLine, $timeMatch)) {
                $time = $this->normalizeTime($timeMatch[1]);
            }

            $proposedBy = null;
            if (preg_match('/(?:proposed by|requested by)\s+([A-Z][A-Za-z.\' -]+)/i', $line, $m)) {
                $proposedBy = trim($m[1], " .");
            } elseif (preg_match('/\(by:?\s*([A-Z][A-Za-z.\' -]+)\)/i', $line, $m)) {
                $proposedBy = trim($m[1], " .");
            }

            $requests[] = [
                'title' => 'Meeting',
                'date' => $date,
                'time' => $time,
                'quote' => trim($line, " \t-•✓❌❓"),
                'proposedBy' => $proposedBy,
            ];
        }

        return $requests;
    }

    private function normalizeDate(string $raw): ?string {
        $ts = strtotime($raw);
        return $ts !== false ? date('Y-m-d', $ts) : null;
    }

    /**
     * Strips a trailing timezone label (UTC, GMT, ...) rather than
     * converting against it — there's no reliable way to know the
     * organizer's actual intended timezone from a chat transcript, or
     * whether it matches this server's default timezone, so treating the
     * stated number as a literal wall-clock time is the safer failure
     * mode than silently shifting it by however many hours a real
     * timezone conversion would apply.
     */
    private function normalizeTime(string $raw): ?string {
        $raw = trim(preg_replace('/\s*(?:UTC|GMT|[A-Z]{2,5})\s*$/', '', trim($raw)));
        $ts = strtotime($raw);
        return $ts !== false ? date('H:i', $ts) : null;
    }

    /**
     * The most recent still-pending meeting suggestion for a conversation,
     * or null if there isn't one (or it's older than
     * PENDING_EXPIRY_SECONDS, in which case it's treated as expired and
     * not returned even though the row is still sitting there as
     * 'pending' — nothing proactively sweeps expired rows, they just stop
     * being returned).
     */
    public function getPendingSuggestion(string $token): ?array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('id', 'title', 'description', 'start_ts', 'end_ts', 'proposed_by', 'source_quote')
           ->from('boudicaai_meeting_sugg')
           ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
           ->andWhere($qb->expr()->eq('status', $qb->createNamedParameter('pending')))
           ->andWhere($qb->expr()->gte('created_at', $qb->createNamedParameter(time() - self::PENDING_EXPIRY_SECONDS, \PDO::PARAM_INT)))
           ->orderBy('created_at', 'DESC')
           ->setMaxResults(1);

        $result = $qb->executeQuery();
        $row = $result->fetch();
        $result->closeCursor();

        return $row ?: null;
    }

    /**
     * Runs extraction over $summaryText (the already-generated,
     * already-shown-to-the-user Boudica summary — see the class docblock
     * for why it's the summary and not the raw transcript) and, if it
     * finds a usable meeting request, stores it as a pending suggestion
     * and returns the stored row. Returns null (does nothing) if there's
     * already a suggestion pending for this token — never stacks a second
     * one on top — or if extraction found nothing usable. Shared by both
     * TalkBotInvokeListener (live '@boudica summarize') and DigestService
     * (background digest polling), which differ only in how they surface
     * the resulting confirmation prompt to the user.
     *
     * @return array{id:int, title:string, description:?string, start_ts:int, end_ts:int, proposed_by:?string, source_quote:?string, had_explicit_time:bool}|null
     */
    public function detectAndStore(string $token, string $summaryText): ?array {
        if ($this->getPendingSuggestion($token) !== null) {
            return null;
        }

        $requests = $this->extractMeetingRequests($summaryText);
        if (empty($requests)) {
            return null;
        }

        // MVP: surface one at a time — if there are several, the rest
        // resurface next time this runs (this one will have been resolved
        // by then).
        $request = $requests[0];

        $startTs = strtotime($request['date'] . ' ' . ($request['time'] ?? '09:00'));
        if ($startTs === false) {
            return null;
        }
        $endTs = $startTs + 1800; // 30 min default — chat rarely states a duration

        try {
            $qb = $this->db->getQueryBuilder();
            $qb->insert('boudicaai_meeting_sugg')
               ->values([
                   'token' => $qb->createNamedParameter($token),
                   'title' => $qb->createNamedParameter($request['title']),
                   'description' => $qb->createNamedParameter($request['quote']),
                   'start_ts' => $qb->createNamedParameter($startTs, \PDO::PARAM_INT),
                   'end_ts' => $qb->createNamedParameter($endTs, \PDO::PARAM_INT),
                   'proposed_by' => $qb->createNamedParameter($request['proposedBy']),
                   'source_quote' => $qb->createNamedParameter($request['quote']),
                   'status' => $qb->createNamedParameter('pending'),
                   'created_at' => $qb->createNamedParameter(time(), \PDO::PARAM_INT),
               ]);
            $qb->executeStatement();
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to store meeting suggestion: ' . $e->getMessage());
            return null;
        }

        return [
            'id' => (int)$this->db->lastInsertId('boudicaai_meeting_sugg'),
            'title' => $request['title'],
            'description' => $request['quote'],
            'start_ts' => $startTs,
            'end_ts' => $endTs,
            'proposed_by' => $request['proposedBy'],
            'source_quote' => $request['quote'],
            'had_explicit_time' => $request['time'] !== null,
        ];
    }

    public function resolveSuggestion(int $id, string $status, ?string $resolvedBy): void {
        try {
            $update = $this->db->getQueryBuilder();
            $update->update('boudicaai_meeting_sugg')
                   ->set('status', $update->createNamedParameter($status))
                   ->set('resolved_by', $update->createNamedParameter($resolvedBy))
                   ->set('resolved_at', $update->createNamedParameter(time(), \PDO::PARAM_INT))
                   ->where($update->expr()->eq('id', $update->createNamedParameter($id, \PDO::PARAM_INT)));
            $update->executeStatement();
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to resolve meeting suggestion: ' . $e->getMessage());
        }
    }

    /**
     * All Nextcloud-user attendees of a Talk room, excluding one user id
     * (typically the person confirming, so they're not "invited" to their
     * own event). Same talk_attendees/talk_rooms join CallParticipantService
     * uses for call recordings, but not tied to a call transcript — this
     * is "who's in the room right now", full stop.
     *
     * @return array<int, array{uid:string, displayName:string, email:?string}>
     */
    public function getOtherRoomParticipants(string $token, string $excludeUserId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('u.uid', 'u.displayname', 'u.email')
           ->from('talk_attendees', 'ta')
           ->innerJoin('ta', 'users', 'u', $qb->expr()->eq('ta.actor_id', 'u.uid'))
           ->where($qb->expr()->eq('ta.room_id',
               $qb->expr()->select('id')
                   ->from('talk_rooms')
                   ->where($qb->expr()->eq('token', $qb->createNamedParameter($token)))
           ))
           ->andWhere($qb->expr()->eq('ta.actor_type', $qb->createNamedParameter('users')))
           ->andWhere($qb->expr()->neq('u.uid', $qb->createNamedParameter($excludeUserId)));

        $result = $qb->executeQuery();
        $rows = $result->fetchAll();
        $result->closeCursor();

        $participants = [];
        foreach ($rows as $row) {
            $participants[] = [
                'uid' => $row['uid'],
                'displayName' => $row['displayname'] ?: $row['uid'],
                'email' => $row['email'] ?: null,
            ];
        }

        return $participants;
    }

    /**
     * Writes the event to $organizerUserId's own calendar. Returns false
     * (never throws) if no writable calendar could be found or the write
     * failed, so the caller can give the user a plain "couldn't do that"
     * answer instead of a stack trace in Talk.
     *
     * @param array<int, array{uid:string, displayName:string, email:?string}> $attendees
     */
    public function createEvent(
        string $organizerUserId,
        string $title,
        int $startTs,
        int $endTs,
        string $description,
        array $attendees,
    ): bool {
        $calendar = $this->findWritableCalendar($organizerUserId);
        if ($calendar === null) {
            $this->logger->warning("No writable calendar found for user {$organizerUserId}");
            return false;
        }

        $organizer = $this->userManager->get($organizerUserId);
        $organizerEmail = $organizer?->getEMailAddress();

        $ics = $this->buildIcs($title, $startTs, $endTs, $description, $organizerEmail, $attendees);
        $uid = bin2hex(random_bytes(16));

        try {
            $calendar->createFromString($uid . '.ics', $ics);
            return true;
        } catch (\Throwable $e) {
            $this->logger->error('Failed to create calendar event: ' . $e->getMessage());
            return false;
        }
    }

    private function findWritableCalendar(string $userId): ?ICreateFromString {
        $calendars = $this->calendarManager->getCalendarsForPrincipal('principals/users/' . $userId);

        foreach ($calendars as $calendar) {
            if (!($calendar instanceof ICreateFromString)) {
                continue;
            }
            if (method_exists($calendar, 'getPermissions')) {
                $permissions = $calendar->getPermissions();
                if (($permissions & Constants::PERMISSION_CREATE) !== Constants::PERMISSION_CREATE) {
                    continue;
                }
            }
            return $calendar;
        }

        return null;
    }

    /**
     * @param array<int, array{uid:string, displayName:string, email:?string}> $attendees
     */
    private function buildIcs(
        string $title,
        int $startTs,
        int $endTs,
        string $description,
        ?string $organizerEmail,
        array $attendees,
    ): string {
        $dtstamp = gmdate('Ymd\THis\Z');
        $dtstart = gmdate('Ymd\THis\Z', $startTs);
        $dtend = gmdate('Ymd\THis\Z', $endTs);
        $uid = bin2hex(random_bytes(16)) . '@myboudica.com';

        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Boudica AI//Talk Bot//EN',
            'BEGIN:VEVENT',
            'UID:' . $uid,
            'DTSTAMP:' . $dtstamp,
            'DTSTART:' . $dtstart,
            'DTEND:' . $dtend,
            'SUMMARY:' . $this->icsEscape($title),
        ];

        if ($description !== '') {
            $lines[] = 'DESCRIPTION:' . $this->icsEscape($description);
        }

        if ($organizerEmail) {
            $lines[] = 'ORGANIZER:mailto:' . $organizerEmail;
        }

        foreach ($attendees as $attendee) {
            if (empty($attendee['email'])) {
                continue; // ATTENDEE requires a mailto — skip anyone without one
            }
            $name = $this->icsEscape($attendee['displayName']);
            $lines[] = 'ATTENDEE;CN=' . $name . ';ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:' . $attendee['email'];
        }

        $lines[] = 'END:VEVENT';
        $lines[] = 'END:VCALENDAR';

        return implode("\r\n", $lines);
    }

    private function icsEscape(string $text): string {
        $text = str_replace(['\\', "\n", ',', ';'], ['\\\\', '\\n', '\\,', '\\;'], $text);
        return $text;
    }
}
