<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version000010Date20260817120000 extends SimpleMigrationStep {

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        // Meeting requests Boudica notices while summarizing a conversation
        // (e.g. "let's meet Tuesday at 3") wait here for a yes/no reply
        // before anything is written to a calendar — see
        // TalkBotInvokeListener::checkForMeetingRequest() /
        // handleMeetingConfirm(). Only one 'pending' row per token at a
        // time, same single-active-item convention as
        // boudicaai_tracking_sessions.
        if (!$schema->hasTable('boudicaai_meeting_sugg')) {
            $table = $schema->createTable('boudicaai_meeting_sugg');

            $table->addColumn('id', 'bigint', [
                'autoincrement' => true,
                'notnull' => true,
            ]);
            $table->addColumn('token', 'string', [
                'notnull' => true,
                'length' => 64,
            ]);
            $table->addColumn('title', 'string', [
                'notnull' => true,
                'length' => 255,
            ]);
            $table->addColumn('description', 'text', [
                'notnull' => false,
            ]);
            $table->addColumn('start_ts', 'bigint', [
                'notnull' => true,
            ]);
            $table->addColumn('end_ts', 'bigint', [
                'notnull' => true,
            ]);
            // Free-text name the extraction picked up (e.g. "Joe") — not a
            // resolved Nextcloud user, just for display in the confirmation
            // prompt.
            $table->addColumn('proposed_by', 'string', [
                'notnull' => false,
                'length' => 255,
            ]);
            // The sentence the request was lifted from, shown back to the
            // user so they can sanity-check the extraction before confirming.
            $table->addColumn('source_quote', 'text', [
                'notnull' => false,
            ]);
            $table->addColumn('status', 'string', [
                'notnull' => true,
                'length' => 16,
                'default' => 'pending',
            ]);
            $table->addColumn('created_at', 'bigint', [
                'notnull' => true,
            ]);
            $table->addColumn('resolved_by', 'string', [
                'notnull' => false,
                'length' => 255,
            ]);
            $table->addColumn('resolved_at', 'bigint', [
                'notnull' => false,
            ]);

            $table->setPrimaryKey(['id']);
            $table->addIndex(['token', 'status', 'created_at'], 'boudicaai_msugg_token_idx');
        }

        return $schema;
    }
}
