import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'crm_ciatos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
});

export async function initializeDatabase(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    // Create database if not exists
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'crm_ciatos'}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${process.env.DB_NAME || 'crm_ciatos'}\``);

    // 1. Users
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'Operacional',
        department VARCHAR(50) NOT NULL DEFAULT 'Comercial',
        avatar TEXT,
        manager_type_id VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 2. System Config (key-value store)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        config_key VARCHAR(100) PRIMARY KEY,
        config_value JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 3. Leads (core)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        company VARCHAR(255),
        trade_name VARCHAR(255),
        legal_name VARCHAR(255),
        cnpj VARCHAR(20),
        cnpj_raw VARCHAR(14),
        company_email VARCHAR(255),
        company_phone VARCHAR(50),
        segment VARCHAR(100),
        size VARCHAR(50),
        tax_regime VARCHAR(50),
        annual_revenue VARCHAR(50),
        payroll_value VARCHAR(50),
        monthly_revenue VARCHAR(50),
        status VARCHAR(50) NOT NULL DEFAULT 'Novo',
        phase_id VARCHAR(36),
        owner_id VARCHAR(36),
        debt_status VARCHAR(50),
        in_queue BOOLEAN DEFAULT TRUE,
        icp_score INT DEFAULT 0,
        city VARCHAR(100),
        state VARCHAR(10),
        address TEXT,
        location VARCHAR(255),
        enriched BOOLEAN DEFAULT FALSE,
        qualified_by_id VARCHAR(36),
        close_probability INT DEFAULT 0,
        engagement_score INT DEFAULT 0,
        service_type VARCHAR(100),
        contract_value VARCHAR(50),
        contract_start VARCHAR(50),
        contract_number VARCHAR(50),
        health_score INT,
        website VARCHAR(255),
        role VARCHAR(100),
        notes TEXT,
        strategic_pains TEXT,
        expectations TEXT,
        onboarding_template_id VARCHAR(36),
        linkedin_dm VARCHAR(255),
        instagram_dm VARCHAR(255),
        linkedin_company VARCHAR(255),
        instagram_company VARCHAR(255),
        -- Nested JSON for complex sub-objects
        detailed_partners JSON,
        marketing_automation JSON,
        onboarding_checklist JSON,
        welcome_data JSON,
        nps_surveys JSON,
        success_tasks JSON,
        feedback_points JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_leads_status (status),
        INDEX idx_leads_owner (owner_id),
        INDEX idx_leads_phase (phase_id),
        INDEX idx_leads_cnpj (cnpj_raw)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 4. Interactions
    await conn.query(`
      CREATE TABLE IF NOT EXISTS interactions (
        id VARCHAR(36) PRIMARY KEY,
        lead_id VARCHAR(36) NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255),
        content TEXT,
        date DATETIME NOT NULL,
        author VARCHAR(255),
        author_id VARCHAR(36),
        delivery_status VARCHAR(20),
        error_message TEXT,
        latency INT,
        score_impact INT,
        script_version_id VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_interactions_lead (lead_id),
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 5. Tasks (lead tasks)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(36) PRIMARY KEY,
        lead_id VARCHAR(36),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        due_date DATETIME,
        priority VARCHAR(20) DEFAULT 'Média',
        completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tasks_lead (lead_id),
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 6. Sales Scripts
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sales_scripts (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        objective TEXT,
        service_type VARCHAR(100),
        funnel_phase_id VARCHAR(36),
        tone VARCHAR(50),
        estimated_duration INT,
        tags JSON,
        bullets JSON,
        is_global BOOLEAN DEFAULT FALSE,
        author_id VARCHAR(36),
        current_version_id VARCHAR(36),
        versions JSON,
        usage_stats JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 7. Onboarding Templates
    await conn.query(`
      CREATE TABLE IF NOT EXISTS onboarding_templates (
        id VARCHAR(36) PRIMARY KEY,
        service_type VARCHAR(100),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        phases JSON,
        updated_at DATETIME,
        updated_by VARCHAR(255)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 8. Master Templates (email)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS master_templates (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        subject VARCHAR(500),
        content TEXT,
        last_updated DATETIME
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 9. User Goals
    await conn.query(`
      CREATE TABLE IF NOT EXISTS user_goals (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        month INT NOT NULL,
        year INT NOT NULL,
        quals_goal INT DEFAULT 0,
        calls_goal INT DEFAULT 0,
        proposals_goal INT DEFAULT 0,
        contracts_goal INT DEFAULT 0,
        UNIQUE KEY uq_user_month_year (user_id, month, year),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 10. Agenda Events
    await conn.query(`
      CREATE TABLE IF NOT EXISTS agenda_events (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        start DATETIME NOT NULL,
        end DATETIME NOT NULL,
        assigned_to_id VARCHAR(36),
        lead_id VARCHAR(36),
        type_id VARCHAR(36),
        type VARCHAR(50),
        description TEXT,
        status VARCHAR(50),
        department VARCHAR(50),
        creator_id VARCHAR(36),
        participants JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 11. Mining Jobs
    await conn.query(`
      CREATE TABLE IF NOT EXISTS mining_jobs (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'Running',
        version INT DEFAULT 1,
        config_payload JSON,
        filters JSON,
        target_count INT DEFAULT 0,
        found_count INT DEFAULT 0,
        pages_fetched INT DEFAULT 0,
        errors INT DEFAULT 0,
        auto_create_segment BOOLEAN DEFAULT FALSE,
        enrich BOOLEAN DEFAULT FALSE,
        last_notification_milestone INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 12. Mining Leads
    await conn.query(`
      CREATE TABLE IF NOT EXISTS mining_leads (
        id VARCHAR(36) PRIMARY KEY,
        job_id VARCHAR(36) NOT NULL,
        name VARCHAR(255),
        trade_name VARCHAR(255),
        cnpj VARCHAR(20),
        cnpj_raw VARCHAR(14),
        segment VARCHAR(100),
        city VARCHAR(100),
        state VARCHAR(10),
        phone VARCHAR(50),
        email VARCHAR(255),
        email_company VARCHAR(255),
        phone_company VARCHAR(50),
        website VARCHAR(255),
        partners JSON,
        contact_name VARCHAR(255),
        contact_phone VARCHAR(50),
        contact_email VARCHAR(255),
        score_ia INT DEFAULT 0,
        debt_status VARCHAR(50),
        debt_value_est VARCHAR(50),
        sources JSON,
        is_garimpo BOOLEAN DEFAULT TRUE,
        is_imported BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_mining_leads_job (job_id),
        FOREIGN KEY (job_id) REFERENCES mining_jobs(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 13. Automation Flows
    await conn.query(`
      CREATE TABLE IF NOT EXISTS automation_flows (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        trigger_type VARCHAR(50) NOT NULL,
        trigger_sub_value VARCHAR(255),
        steps JSON,
        active BOOLEAN DEFAULT TRUE,
        stats JSON,
        logs JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 14. Campaigns
    await conn.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        smart_list_id VARCHAR(36),
        templates JSON,
        status VARCHAR(20) DEFAULT 'InReview',
        comments JSON,
        stats JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 15. Smart Lists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS smart_lists (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        filters JSON NOT NULL,
        leads_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 16. Chat Threads
    await conn.query(`
      CREATE TABLE IF NOT EXISTS chat_threads (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(255),
        lead_id VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 17. Chat Messages
    await conn.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(36) PRIMARY KEY,
        thread_id VARCHAR(36) NOT NULL,
        sender_id VARCHAR(36),
        sender_name VARCHAR(255),
        content TEXT,
        timestamp DATETIME,
        file_url TEXT,
        file_name VARCHAR(255),
        FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 18. SDR Qualifications
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sdr_qualifications (
        id VARCHAR(36) PRIMARY KEY,
        sdr_id VARCHAR(36) NOT NULL,
        lead_id VARCHAR(36) NOT NULL,
        company_name VARCHAR(255),
        date DATETIME,
        type VARCHAR(20) NOT NULL,
        status VARCHAR(20) DEFAULT 'Pending',
        bonus_value DECIMAL(10,2) DEFAULT 0,
        FOREIGN KEY (sdr_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 19. Audit Logs
    await conn.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(36) PRIMARY KEY,
        action VARCHAR(255) NOT NULL,
        entity_id VARCHAR(36),
        user_id VARCHAR(36),
        user_name VARCHAR(255),
        timestamp DATETIME,
        previous_state JSON,
        new_state JSON,
        INDEX idx_audit_entity (entity_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 20. Integration Logs
    await conn.query(`
      CREATE TABLE IF NOT EXISTS integration_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lead_id VARCHAR(36),
        lead_name VARCHAR(255),
        event VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 21. Notifications
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36),
        title VARCHAR(255),
        message TEXT,
        timestamp DATETIME,
        type VARCHAR(20) DEFAULT 'info',
        is_read BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('✅ Database initialized - all tables created');
  } finally {
    conn.release();
  }
}

export default pool;
