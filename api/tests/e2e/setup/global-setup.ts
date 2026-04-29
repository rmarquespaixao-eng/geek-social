import { Client } from 'pg'

const ADMIN_URL = 'postgresql://dev:dev@localhost:5432/postgres'
const TEST_DB = 'geek_social_test'

export async function setup() {
  const client = new Client({ connectionString: ADMIN_URL })
  await client.connect()
  await client.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB],
  )
  await client.query(`DROP DATABASE IF EXISTS ${TEST_DB}`)
  await client.query(`CREATE DATABASE ${TEST_DB}`)
  await client.end()
}

export async function teardown() {
  const client = new Client({ connectionString: ADMIN_URL })
  await client.connect()
  await client.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB],
  )
  await client.query(`DROP DATABASE IF EXISTS ${TEST_DB}`)
  await client.end()
}
