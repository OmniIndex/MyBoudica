<?php

declare(strict_types=1);

namespace OCA\BoudicaAi\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version000009Date20260814190000 extends SimpleMigrationStep {

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        // Persisted digest summaries — unlike handleSummarize()'s existing
        // on-demand summaries (which only ever get posted back into Talk as
        // a bot reply and never stored), these are written by the polling
        // job so the digest page can read them instantly without calling
        // Boudica Inference on every page view.
        if (!$schema->hasTable('boudicaai_summaries')) {
            $table = $schema->createTable('boudicaai_summaries');

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
            $table->addColumn('summary_text', 'text', [
                'notnull' => true,
            ]);
            $table->addColumn('message_count', 'integer', [
                'notnull' => true,
                'default' => 0,
            ]);
            $table->addColumn('generated_at', 'bigint', [
                'notnull' => true,
            ]);

            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id', 'generated_at'], 'boudicaai_summ_user_gen_idx');
            $table->addIndex(['token'], 'boudicaai_summ_token_idx');
        }

        return $schema;
    }
}
