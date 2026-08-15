<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version000002Date20260727120000 extends SimpleMigrationStep {

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('boudicaai_messages')) {
            $table = $schema->createTable('boudicaai_messages');

            $table->addColumn('id', 'bigint', [
                'autoincrement' => true,
                'notnull' => true,
            ]);
            $table->addColumn('token', 'string', [
                'notnull' => true,
                'length' => 64,
            ]);
            $table->addColumn('actor_name', 'string', [
                'notnull' => true,
                'length' => 255,
            ]);
            $table->addColumn('message', 'text', [
                'notnull' => true,
            ]);
            $table->addColumn('timestamp', 'bigint', [
                'notnull' => true,
            ]);

            $table->setPrimaryKey(['id']);
            $table->addIndex(['token', 'timestamp'], 'boudicaai_msg_token_ts_idx');
        }

        return $schema;
    }
}
