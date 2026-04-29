-- Cria banco auxiliar usado por pg-boss (jobs/queues do Steam sync etc.)
SELECT 'CREATE DATABASE geek_social_jobs'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'geek_social_jobs')\gexec
