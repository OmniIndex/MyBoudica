<?php

namespace OCA\BoudicaCode\Service;

/**
 * Produces the file tree for a brand-new project of a given stack —
 * ported from the Python CLI's ProjectManager.scaffold_*() methods and
 * git_integration.py's get_language_gitignore()/get_readme_template().
 *
 * Deliberately data-only: scaffold() returns a plan (directories +
 * relative-path => content file map) rather than touching disk itself,
 * so AgentController can write it via Nextcloud's Files API in one
 * place, with the same path-safety checks used for every other write.
 *
 * Build/debug scaffolding (GitHub Actions workflow generation, git init,
 * CMake build presets beyond CMakeLists.txt itself) is intentionally
 * NOT ported — this app already has its own compile-check button
 * (CompileController) and explicitly has no build/run/debug workflow.
 */
class ProjectScaffolder {

    public const SUPPORTED_STACKS = ['cpp', 'python', 'nodejs', 'typescript', 'java', 'bash', 'batch'];

    /**
     * @return array{dirs: string[], files: array<string,string>}
     */
    public function scaffold(string $projectName, string $stack): array {
        $plan = match ($stack) {
            'cpp' => $this->scaffoldCpp($projectName),
            'python' => $this->scaffoldPython($projectName),
            'nodejs' => $this->scaffoldNodejs($projectName),
            'typescript' => $this->scaffoldTypescript($projectName),
            'java' => $this->scaffoldJava($projectName),
            'bash' => $this->scaffoldBash($projectName),
            'batch' => $this->scaffoldBatch($projectName),
            default => ['dirs' => [], 'files' => []],
        };

        // Standardized files added to every project, but only if the
        // per-stack scaffold above didn't already create one — mirrors
        // ProjectManager._add_standardized_files().
        if (!isset($plan['files']['.gitignore'])) {
            $plan['files']['.gitignore'] = $this->gitignoreFor($stack);
        }
        if (!isset($plan['files']['README.md'])) {
            $plan['files']['README.md'] = $this->readmeFor($projectName, $stack);
        }

        $plan['files']['.boudica_project.json'] = json_encode([
            'name' => $projectName,
            'stack' => $stack,
            'created' => (new \DateTime())->format(\DateTime::ATOM),
            'version' => '0.0.1',
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

        return $plan;
    }

    private function scaffoldCpp(string $name): array {
        $cmake = <<<CMAKE
cmake_minimum_required(VERSION 3.10)
project({$name})

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Enable debug symbols
set(CMAKE_CXX_FLAGS "\${CMAKE_CXX_FLAGS} -g")
set(CMAKE_BUILD_TYPE Debug)

file(GLOB SOURCES "src/*.cpp" "*.cpp")
add_executable({$name} \${SOURCES})
target_include_directories({$name} PRIVATE \${CMAKE_CURRENT_SOURCE_DIR}/include)

CMAKE;
        return [
            'dirs' => ['src', 'include'],
            'files' => ['CMakeLists.txt' => $cmake],
        ];
    }

    private function scaffoldPython(string $name): array {
        $setup = <<<PY
from setuptools import setup, find_packages

setup(
    name='{$name}',
    version='0.0.1',
    packages=find_packages(),
    python_requires='>=3.7',
    install_requires=[
        # Add dependencies from requirements.txt
    ],
)

PY;
        return [
            'dirs' => ['src'],
            'files' => [
                'requirements.txt' => "# Project dependencies\n",
                'setup.py' => $setup,
                'src/__init__.py' => '',
                '.gitignore' => <<<GI
__pycache__/
*.py[cod]
*\$py.class
*.so
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
.venv/
venv/
ENV/
.vscode/
.idea/
*.egg-info/
.DS_Store

GI,
            ],
        ];
    }

    private function scaffoldNodejs(string $name): array {
        $pkg = [
            'name' => $name,
            'version' => '0.0.1',
            'description' => 'Node.js project scaffolded by Boudica Code',
            'main' => 'src/index.js',
            'scripts' => [
                'start' => 'node src/index.js',
                'dev' => 'node --watch src/index.js',
                'test' => 'echo "Error: no test specified" && exit 1',
            ],
            'keywords' => [],
            'author' => '',
            'license' => 'ISC',
            'dependencies' => new \stdClass(),
        ];
        return [
            'dirs' => ['src'],
            'files' => [
                'package.json' => json_encode($pkg, JSON_PRETTY_PRINT) . "\n",
                'src/index.js' => "console.log('Hello from Node.js!');\n",
                '.gitignore' => "node_modules/\npackage-lock.json\n.env\n.DS_Store\n.vscode/\n.idea/\ndist/\nbuild/\n",
            ],
        ];
    }

    private function scaffoldTypescript(string $name): array {
        $pkg = [
            'name' => $name,
            'version' => '0.0.1',
            'description' => 'TypeScript project scaffolded by Boudica Code',
            'main' => 'dist/index.js',
            'scripts' => [
                'build' => 'tsc',
                'start' => 'node dist/index.js',
                'dev' => 'tsc --watch',
                'test' => 'echo "Error: no test specified" && exit 1',
            ],
            'keywords' => [],
            'author' => '',
            'license' => 'ISC',
            'devDependencies' => ['typescript' => '^5.0.0'],
            'dependencies' => new \stdClass(),
        ];
        $tsconfig = [
            'compilerOptions' => [
                'target' => 'ES2020',
                'module' => 'commonjs',
                'lib' => ['ES2020'],
                'outDir' => './dist',
                'rootDir' => './src',
                'strict' => true,
                'esModuleInterop' => true,
                'skipLibCheck' => true,
                'forceConsistentCasingInFileNames' => true,
                'resolveJsonModule' => true,
                'moduleResolution' => 'node',
            ],
            'include' => ['src/**/*'],
            'exclude' => ['node_modules', 'dist'],
        ];
        return [
            'dirs' => ['src'],
            'files' => [
                'package.json' => json_encode($pkg, JSON_PRETTY_PRINT) . "\n",
                'tsconfig.json' => json_encode($tsconfig, JSON_PRETTY_PRINT) . "\n",
                'src/index.ts' => "console.log('Hello from TypeScript!');\n",
                '.gitignore' => "node_modules/\ndist/\npackage-lock.json\n.env\n.DS_Store\n.vscode/\n.idea/\n",
            ],
        ];
    }

    private function scaffoldJava(string $name): array {
        $pom = <<<POM
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>{$name}</artifactId>
    <version>0.0.1</version>

    <name>{$name}</name>
    <description>Java project scaffolded by Boudica Code</description>

    <properties>
        <maven.compiler.source>11</maven.compiler.source>
        <maven.compiler.target>11</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <dependencies>
        <!-- Add dependencies here -->
    </dependencies>
</project>

POM;
        $app = <<<JAVA
package com.example;

public class App {
    public static void main(String[] args) {
        System.out.println("Hello from Java!");
    }
}

JAVA;
        return [
            'dirs' => [
                'src/main/java/com/example',
                'src/test/java/com/example',
            ],
            'files' => [
                'pom.xml' => $pom,
                'src/main/java/com/example/App.java' => $app,
                '.gitignore' => "target/\n.classpath\n.project\n.settings/\n*.jar\n*.class\n.DS_Store\n.vscode/\n.idea/\n*.iml\n",
            ],
        ];
    }

    private function scaffoldBash(string $name): array {
        return [
            'dirs' => ['src'],
            'files' => [
                'src/main.sh' => "#!/bin/bash\n# Main entry point for bash scripts\n\necho \"Hello from Bash!\"\n",
                '.gitignore' => "*.log\n*.tmp\n.DS_Store\n.vscode/\n.idea/\n",
                'README.md' => "# {$name}\n\nBash script project scaffolded by Boudica Code.\n\n## Running\n\n```bash\n./src/main.sh\n```\n",
            ],
        ];
    }

    private function scaffoldBatch(string $name): array {
        return [
            'dirs' => ['src'],
            'files' => [
                'src/main.bat' => "@echo off\r\nREM Main entry point for batch scripts\r\n\r\necho Hello from Batch!\r\npause\r\n",
                '.gitignore' => "*.log\n*.tmp\n.DS_Store\n.vscode/\n.idea/\n",
                'README.md' => "# {$name}\n\nWindows batch file project scaffolded by Boudica Code.\n\n## Running\n\n```cmd\nsrc\\main.bat\n```\n",
            ],
        ];
    }

    private function gitignoreFor(string $stack): string {
        return match ($stack) {
            'cpp' => "build/\ndist/\n*.o\n*.a\n*.so\n*.dylib\n*.dll\n*.exe\n*.out\nCMakeCache.txt\nCMakeFiles/\ncmake_install.cmake\nMakefile\n.vscode/\n.idea/\n.DS_Store\n",
            'java' => "target/\n*.class\n*.jar\n.vscode/\n.idea/\n.DS_Store\n",
            default => ".env\n.DS_Store\n*.log\n.vscode/\n.idea/\n",
        };
    }

    private function readmeFor(string $name, string $stack): string {
        $runSection = match ($stack) {
            'cpp' => "## Building\n\n```bash\nmkdir build && cd build && cmake .. && make\n```\n",
            'python' => "## Requirements\n\n```bash\npip install -r requirements.txt\n```\n",
            'nodejs' => "## Installation\n\n```bash\nnpm install\n```\n\n## Running\n\n```bash\nnpm start\n```\n",
            'typescript' => "## Installation\n\n```bash\nnpm install\n```\n\n## Building\n\n```bash\nnpm run build\n```\n",
            'java' => "## Building\n\n```bash\nmvn clean compile\n```\n",
            default => '',
        };
        return "# {$name}\n\nA " . ucfirst($stack) . " project scaffolded by BoudicaCode.\n\n{$runSection}\n---\n\nGenerated by BoudicaCode.\n";
    }
}
