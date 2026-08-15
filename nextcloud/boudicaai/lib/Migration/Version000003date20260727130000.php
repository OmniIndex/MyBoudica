<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version000003Date20260727130000 extends SimpleMigrationStep {

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('boudicaai_messages')) {
            $table = $schema->getTable('boudicaai_messages');

            // Talk's own per-conversation message ID — needed so edits/deletes can find
            // the original row later. Nullable for backward compatibility with rows
            // logged before this migration.
            if (!$table->hasColumn('message_id')) {
                $table->addColumn('message_id', 'string', [
                    'notnull' => false,
                    'length' => 64,
                ]);
            }

            if (!$table->hasColumn('edited_at')) {
                $table->addColumn('edited_at', 'bigint', [
                    'notnull' => false,
                ]);
            }

            if (!$table->hasColumn('deleted_at')) {
                $table->addColumn('deleted_at', 'bigint', [
                    'notnull' => false,
                ]);
            }

            if (!$table->hasColumn('is_system_message')) {
                $table->addColumn('is_system_message', 'boolean', [
                    'notnull' => false,
                    'default' => false,
                ]);
            }

            // When a row represents an edit, this points back at the message_id
            // it edited. The original row is never overwritten — this preserves
            // a full audit trail of every version of a message, not just the latest.
            if (!$table->hasColumn('edit_of_message_id')) {
                $table->addColumn('edit_of_message_id', 'string', [
                    'notnull' => false,
                    'length' => 64,
                ]);
            }

            if (!$table->hasIndex('boudicaai_msg_token_msgid_idx')) {
                $table->addIndex(['token', 'message_id'], 'boudicaai_msg_token_msgid_idx');
            }
        }

        return $schema;
    }
}