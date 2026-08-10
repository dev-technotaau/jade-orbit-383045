module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [
            2,
            'always',
            [
                'feat',     // New feature
                'fix',      // Bug fix
                'docs',     // Documentation
                'style',    // Code style (formatting, semicolons, etc.)
                'refactor', // Code refactoring
                'perf',     // Performance improvement
                'test',     // Tests
                'build',    // Build system or external deps
                'ci',       // CI/CD changes
                'chore',    // Maintenance tasks
                'revert',   // Revert a commit
                'wip',      // Work in progress
            ],
        ],
        'scope-enum': [
            1, // Warning only
            'always',
            [
                'backend',
                'frontend',
                'api',
                'db',
                'ci',
                'deps',
                'config',
                'ui',
                'a11y',
                'perf',
                'security',
                // Module surfaces. These replaced the host platform's
                // 'jobs' / 'candidate' / 'employer' / 'auth' / 'admin' / 'seo'
                // scopes, none of which exist here.
                'whatsapp',
                'inbox',
                'campaigns',
                'templates',
                'contacts',
                'analytics',
                'webhook',
                'jobs', // BullMQ queues/workers — not a job board
            ],
        ],
        'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
        'subject-max-length': [2, 'always', 100],
        'body-max-line-length': [1, 'always', 200],
    },
};
