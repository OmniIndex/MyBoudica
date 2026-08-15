<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version000004Date20260805140000 extends SimpleMigrationStep {

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        // Add tracking_session_id column to existing messages table
        if ($schema->hasTable('boudicaai_messages')) {
            $table = $schema->getTable('boudicaai_messages');

            if (!$table->hasColumn('tracking_session_id')) {
                $table->addColumn('tracking_session_id', 'integer', [
                    'notnull' => false,
                ]);
            }

            if (!$table->hasIndex('boudicaai_msg_tracking_idx')) {
                $table->addIndex(['tracking_session_id'], 'boudicaai_msg_tracking_idx');
            }
        }

        // Create tracking sessions table
        if (!$schema->hasTable('boudicaai_tracking_sessions')) {
            $table = $schema->createTable('boudicaai_tracking_sessions');
            $table->addColumn('id', 'integer', [
                'autoincrement' => true,
                'notnull' => true,
            ]);
            $table->addColumn('token', 'string', [
                'length' => 255,
                'notnull' => true,
            ]);
            $table->addColumn('user_id', 'string', [
                'length' => 255,
                'notnull' => true,
            ]);
            $table->addColumn('started_at', 'bigint', [
                'notnull' => true,
            ]);
            $table->addColumn('stopped_at', 'bigint', [
                'notnull' => false,
            ]);
            $table->addColumn('started_message_id', 'string', [
                'length' => 64,
                'notnull' => false,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['token', 'user_id'], 'boudicaai_track_token_user_idx');
            $table->addIndex(['stopped_at'], 'boudicaai_track_stopped_idx');
        }

        return $schema;
    }
}
