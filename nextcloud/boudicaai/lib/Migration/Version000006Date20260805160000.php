<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version000006Date20260805160000 extends SimpleMigrationStep {

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        // Enhance call_transcripts table for manual uploads
        if ($schema->hasTable('boudicaai_call_transcripts')) {
            $table = $schema->getTable('boudicaai_call_transcripts');

            // File metadata for uploaded call recordings
            if (!$table->hasColumn('file_id')) {
                $table->addColumn('file_id', 'integer', [
                    'notnull' => false,
                ]);
            }

            if (!$table->hasColumn('file_path')) {
                $table->addColumn('file_path', 'string', [
                    'length' => 512,
                    'notnull' => false,
                ]);
            }

            if (!$table->hasColumn('file_name')) {
                $table->addColumn('file_name', 'string', [
                    'length' => 255,
                    'notnull' => false,
                ]);
            }

            // Transcription status tracking
            if (!$table->hasColumn('transcription_status')) {
                $table->addColumn('transcription_status', 'string', [
                    'length' => 50,
                    'default' => 'pending',
                    'notnull' => true,
                ]);
            }

            if (!$table->hasColumn('transcription_error')) {
                $table->addColumn('transcription_error', 'text', [
                    'notnull' => false,
                ]);
            }

            if (!$table->hasIndex('boudicaai_call_status_idx')) {
                $table->addIndex(['transcription_status', 'token'], 'boudicaai_call_status_idx');
            }
        }

        return $schema;
    }
}
