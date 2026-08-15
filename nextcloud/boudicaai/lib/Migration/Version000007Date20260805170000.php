<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version000007Date20260805170000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        // Create call participants table
        if (!$schema->hasTable('boudicaai_call_participants')) {
            $table = $schema->createTable('boudicaai_call_participants');
            $table->addColumn('id', 'bigint', [
                'autoincrement' => true,
                'notnull' => true,
            ]);
            $table->addColumn('call_transcript_id', 'bigint', [
                'notnull' => true,
            ]);
            $table->addColumn('participant_user_id', 'string', [
                'length' => 255,
                'notnull' => true,
            ]);
            $table->addColumn('participant_display_name', 'string', [
                'length' => 255,
                'notnull' => true,
            ]);
            $table->addColumn('participant_email', 'string', [
                'length' => 255,
                'notnull' => false,
            ]);
            $table->addColumn('joined_at', 'integer', [
                'notnull' => true,
            ]);
            $table->addColumn('left_at', 'integer', [
                'notnull' => false,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['call_transcript_id'], 'idx_call_participants_call');
            $table->addIndex(['participant_user_id'], 'idx_call_participants_user');
        }

        // Add participants tracking columns to call_transcripts if not exists
        if ($schema->hasTable('boudicaai_call_transcripts')) {
            $table = $schema->getTable('boudicaai_call_transcripts');
            
            if (!$table->hasColumn('participants_captured')) {
                $table->addColumn('participants_captured', 'boolean', [
                    'notnull' => false,
                    'default' => false,
                ]);
            }

            if (!$table->hasColumn('email_sent_at')) {
                $table->addColumn('email_sent_at', 'integer', [
                    'notnull' => false,
                ]);
            }

            if (!$table->hasColumn('email_recipients')) {
                $table->addColumn('email_recipients', 'text', [
                    'notnull' => false,
                ]);
            }
        }

        return $schema;
    }
}
