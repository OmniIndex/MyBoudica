<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version000005Date20260805150000 extends SimpleMigrationStep {

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        // Create call transcripts table to store voice call transcriptions
        if (!$schema->hasTable('boudicaai_call_transcripts')) {
            $table = $schema->createTable('boudicaai_call_transcripts');
            $table->addColumn('id', 'integer', [
                'autoincrement' => true,
                'notnull' => true,
            ]);
            $table->addColumn('token', 'string', [
                'length' => 255,
                'notnull' => true,
            ]);
            $table->addColumn('call_id', 'string', [
                'length' => 255,
                'notnull' => false,
            ]);
            $table->addColumn('user_id', 'string', [
                'length' => 255,
                'notnull' => true,
            ]);
            $table->addColumn('transcript_text', 'text', [
                'notnull' => false,
            ]);
            $table->addColumn('transcript_raw', 'text', [
                'notnull' => false,
            ]);
            $table->addColumn('duration_seconds', 'integer', [
                'notnull' => false,
            ]);
            $table->addColumn('participants', 'text', [
                'notnull' => false,
            ]);
            $table->addColumn('call_started_at', 'bigint', [
                'notnull' => true,
            ]);
            $table->addColumn('call_ended_at', 'bigint', [
                'notnull' => false,
            ]);
            $table->addColumn('transcript_fetched_at', 'bigint', [
                'notnull' => false,
            ]);
            $table->addColumn('tracking_session_id', 'integer', [
                'notnull' => false,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['token', 'call_id'], 'boudicaai_call_token_id_idx');
            $table->addIndex(['user_id'], 'boudicaai_call_user_idx');
            $table->addIndex(['tracking_session_id'], 'boudicaai_call_tracking_idx');
        }

        return $schema;
    }
}
