<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version000008Date20260814180000 extends SimpleMigrationStep {

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        // Per (user, room) digest polling state. One row per user per Talk
        // room they're in — the polling job reads/writes this each cycle.
        if (!$schema->hasTable('boudicaai_room_state')) {
            $table = $schema->createTable('boudicaai_room_state');

            $table->addColumn('id', 'bigint', [
                'autoincrement' => true,
                'notnull' => true,
            ]);
            $table->addColumn('user_id', 'string', [
                'notnull' => true,
                'length' => 255,
            ]);
            $table->addColumn('token', 'string', [
                'notnull' => true,
                'length' => 64,
            ]);
            // 'quiet' — normal, gets summarized when new messages show up.
            // 'active' — a burst (>threshold new messages) was seen; digest
            // deliberately does NOT summarize while active, it just points
            // the user at the room. Stays active until they've read past
            // flagged_last_read_message in Talk itself (see that column).
            $table->addColumn('status', 'string', [
                'notnull' => true,
                'length' => 16,
                'default' => 'quiet',
            ]);
            // Latest boudicaai_messages.timestamp already accounted for
            // (either summarized, or evaluated-and-skipped because there
            // was nothing new). Next poll only looks at messages after this.
            $table->addColumn('watermark_ts', 'bigint', [
                'notnull' => true,
                'default' => 0,
            ]);
            // Snapshot of oc_talk_attendees.last_read_message at the moment
            // this room got flagged 'active'. Cleared back to 'quiet' once
            // the user's current last_read_message has advanced past this —
            // i.e. they've actually been back into Talk and read further,
            // not just that new messages stopped arriving.
            $table->addColumn('flagged_last_read_message', 'bigint', [
                'notnull' => false,
            ]);
            $table->addColumn('flagged_at', 'bigint', [
                'notnull' => false,
            ]);
            $table->addColumn('updated_at', 'bigint', [
                'notnull' => true,
                'default' => 0,
            ]);

            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['user_id', 'token'], 'boudicaai_roomstate_user_tok_idx');
            $table->addIndex(['status'], 'boudicaai_roomstate_status_idx');
        }

        return $schema;
    }
}
