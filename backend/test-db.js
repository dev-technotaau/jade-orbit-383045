require('dotenv').config();
const { Client } = require('pg');

async function testConnection(name, connectionString) {
    console.log(`\n--- Testing ${name} ---`);
    console.log(`URL: ${connectionString.replace(/:[^:/@]+@/, ':****@')}`); // Mask password

    const client = new Client({
        connectionString: connectionString,
        ssl: { rejectUnauthorized: false }, // Remote/managed PostgreSQL providers require SSL
        connectionTimeoutMillis: 5000,
    });

    try {
        await client.connect();
        console.log(`✅ Connection Successful to ${name}!`);

        const res = await client.query('SELECT version()');
        console.log(`Version: ${res.rows[0].version}`);

        await client.end();
        return true;
    } catch (err) {
        console.error(`❌ Connection Failed to ${name}:`);
        console.error(`Error: ${err.message}`);
        if (err.code) console.error(`Code: ${err.code}`);
        return false;
    }
}

async function run() {
    console.log('Testing PostgreSQL Connectivity...');

    // 1. Test Session Mode (Port 5432) - Required for Migrations
    // Note: We use DIRECT_URL or allow constructing it
    const sessionUrl = process.env.DIRECT_URL;
    if (sessionUrl) {
        await testConnection('DIRECT_URL (Session Mode - Port 5432)', sessionUrl);
    } else {
        console.log('Skipping Session Mode (DIRECT_URL not set)');
    }

    // 2. Test Transaction Mode (Port 6543) - Application Queries
    const txUrl = process.env.DATABASE_URL;
    if (txUrl) {
        await testConnection('DATABASE_URL (Transaction Mode - Port 6543)', txUrl);
    } else {
        console.log('Skipping Transaction Mode (DATABASE_URL not set)');
    }
}

run();
