const { defineConfig } = require('@prisma/config');
require('dotenv').config();

module.exports = defineConfig({
    schema: 'prisma/schema.prisma',
    datasource: {
        provider: 'postgresql',
        url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
});
