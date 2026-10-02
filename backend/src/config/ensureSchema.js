const { pool } = require('./database');

/**
 * Migrations idempotentes (ALTER IF NOT EXISTS colonnes / tables).
 */
async function ensureFieldOpsSchema() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS technical_scan_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NULL,
        camera_id VARCHAR(32) NULL,
        zone VARCHAR(128) NULL,
        reason VARCHAR(64) NULL,
        source_type VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tech_scan_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (e) {
    console.warn('[DB] technical_scan_logs :', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registered_cameras (
        id INT AUTO_INCREMENT PRIMARY KEY,
        camera_id VARCHAR(32) NOT NULL,
        name VARCHAR(128) NOT NULL,
        zone VARCHAR(128) NULL,
        camera_type VARCHAR(32) NOT NULL DEFAULT 'rtsp',
        rtsp_host_url VARCHAR(512) NULL,
        rtsp_username VARCHAR(128) NULL,
        rtsp_password_enc TEXT NULL,
        scan_interval_seconds INT NOT NULL DEFAULT 5,
        active TINYINT(1) NOT NULL DEFAULT 1,
        last_test_ok TINYINT(1) NULL,
        last_test_at DATETIME NULL,
        last_test_error VARCHAR(255) NULL,
        last_snapshot_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_reg_cam_id (camera_id),
        INDEX idx_reg_cam_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[DB] Table registered_cameras prête.');
  } catch (e) {
    console.warn('[DB] registered_cameras :', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS camera_inspection_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        camera_id VARCHAR(32) NOT NULL,
        admin_id INT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP NULL,
        scans_count INT NOT NULL DEFAULT 0,
        INDEX idx_cam_session_cam (camera_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (e) {
    console.warn('[DB] camera_inspection_sessions :', e.message);
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS watched_containers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        container_code VARCHAR(32) NOT NULL,
        admin_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_watched_code (container_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (e) {
    console.warn('[DB] watched_containers :', e.message);
  }
}

async function ensureSchema() {
  await ensureFieldOpsSchema();
  const searchHistoryFragments = [
    "ADD COLUMN source VARCHAR(64) NULL DEFAULT 'manual'",
    'ADD COLUMN global_confidence DECIMAL(7,4) NULL',
    'ADD COLUMN evidence_path VARCHAR(512) NULL',
  ];

  for (const frag of searchHistoryFragments) {
    try {
      await pool.query(`ALTER TABLE search_history ${frag}`);
    } catch (e) {
      if (e.errno !== 1060) {
        console.warn('[DB] Migration search_history :', e.message);
      }
    }
  }
  console.log('[DB] Schéma search_history vérifié (source, global_confidence, evidence_path).');

  const detectionFragments = [
    'ADD COLUMN global_confidence DECIMAL(7,4) NULL',
    'ADD COLUMN yolo_confidence DECIMAL(7,4) NULL',
    'ADD COLUMN yolo_detected TINYINT(1) NULL',
    'ADD COLUMN annotated_path VARCHAR(512) NULL',
  ];

  for (const frag of detectionFragments) {
    try {
      await pool.query(`ALTER TABLE detections ${frag}`);
    } catch (e) {
      if (e.errno !== 1060) {
        console.warn('[DB] Migration detections :', e.message);
      }
    }
  }
  console.log('[DB] Schéma detections vérifié (global_confidence, yolo_*, annotated_path).');

  const searchHistoryExtra = [
    'ADD COLUMN detection_mode VARCHAR(32) NULL',
    'ADD COLUMN source_match VARCHAR(32) NULL',
    'ADD COLUMN camera_name VARCHAR(50) NULL',
    'ADD COLUMN zone VARCHAR(100) NULL',
    'ADD COLUMN confidence DECIMAL(7,4) NULL',
  ];

  for (const frag of searchHistoryExtra) {
    try {
      await pool.query(`ALTER TABLE search_history ${frag}`);
    } catch (e) {
      if (e.errno !== 1060) {
        console.warn('[DB] Migration search_history extra :', e.message);
      }
    }
  }
  console.log('[DB] Schéma search_history étendu (detection_mode, source_match, camera, zone).');

  const searchHistoryAnalysis = ['ADD COLUMN analysis_json LONGTEXT NULL'];
  for (const frag of searchHistoryAnalysis) {
    try {
      await pool.query(`ALTER TABLE search_history ${frag}`);
    } catch (e) {
      if (e.errno !== 1060) {
        console.warn('[DB] Migration search_history analysis_json :', e.message);
      }
    }
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vision_uploads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NULL,
        search_history_id INT NULL,
        detection_id INT NULL,
        stored_filename VARCHAR(255) NOT NULL,
        evidence_path VARCHAR(512) NOT NULL,
        original_filename VARCHAR(255) NULL,
        zone VARCHAR(255) NULL,
        location_label VARCHAR(255) NULL,
        match_code VARCHAR(64) NULL,
        primary_ocr_code VARCHAR(64) NULL,
        pipeline_mode VARCHAR(32) NULL,
        ocr_avg_confidence DECIMAL(7,4) NULL,
        yolo_detection_count INT NULL,
        yolo_detected TINYINT(1) NULL DEFAULT 0,
        match_found TINYINT(1) DEFAULT 0,
        analysis_json LONGTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_vision_uploads_created (created_at),
        INDEX idx_vision_uploads_zone (zone(64))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[DB] Table vision_uploads prête.');
  } catch (e) {
    console.warn('[DB] vision_uploads :', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(64) NOT NULL DEFAULT 'info',
        title VARCHAR(255) NOT NULL,
        message TEXT,
        payload TEXT NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notifications_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[DB] Table notifications prête.');
  } catch (e) {
    console.warn('[DB] notifications :', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS camera_frames (
        id INT AUTO_INCREMENT PRIMARY KEY,
        camera_id VARCHAR(20) NOT NULL,
        source_type ENUM('demo','upload','video_frame') NOT NULL DEFAULT 'demo',
        filename VARCHAR(255) NOT NULL,
        image_path VARCHAR(512) NOT NULL,
        primary_code VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_camera_frames_cam (camera_id),
        INDEX idx_camera_frames_code (primary_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[DB] Table camera_frames prête.');
  } catch (e) {
    console.warn('[DB] camera_frames :', e.message);
  }

  // --- Phase 1 : suivi de la dernière position connue ---
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS container_last_positions (
        container_code VARCHAR(64) PRIMARY KEY,
        last_camera_id VARCHAR(20) NULL,
        last_camera_name VARCHAR(64) NULL,
        last_zone VARCHAR(120) NULL,
        last_confidence DECIMAL(7,4) NULL,
        last_proof_image_url VARCHAR(512) NULL,
        last_detected_at DATETIME NULL,
        detection_mode VARCHAR(32) NULL,
        orientation VARCHAR(32) NULL,
        ocr_quality VARCHAR(16) NULL,
        movements_count INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_clp_detected (last_detected_at),
        INDEX idx_clp_zone (last_zone(64))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[DB] Table container_last_positions prête.');
  } catch (e) {
    console.warn('[DB] container_last_positions :', e.message);
  }

  // --- Phase 1 : historique des déplacements ---
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS container_movements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        container_code VARCHAR(64) NOT NULL,
        camera_id VARCHAR(20) NULL,
        camera_name VARCHAR(64) NULL,
        zone VARCHAR(120) NULL,
        confidence DECIMAL(7,4) NULL,
        proof_image_path VARCHAR(512) NULL,
        proof_image_url VARCHAR(512) NULL,
        detected_at DATETIME NOT NULL,
        source VARCHAR(32) NULL,
        detection_mode VARCHAR(32) NULL,
        orientation VARCHAR(32) NULL,
        ocr_quality VARCHAR(16) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cm_code (container_code),
        INDEX idx_cm_detected (detected_at),
        INDEX idx_cm_code_detected (container_code, detected_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[DB] Table container_movements prête.');
  } catch (e) {
    console.warn('[DB] container_movements :', e.message);
  }

  // --- Phase 3 : alertes intelligentes ---
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        alert_uuid VARCHAR(64) NOT NULL,
        type VARCHAR(48) NOT NULL,
        severity ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
        container_code VARCHAR(64) NULL,
        camera_id VARCHAR(20) NULL,
        camera_name VARCHAR(64) NULL,
        zone VARCHAR(120) NULL,
        message VARCHAR(512) NOT NULL,
        status ENUM('active','resolved','ignored') NOT NULL DEFAULT 'active',
        proof_image_url VARCHAR(512) NULL,
        source VARCHAR(48) NULL,
        details_json JSON NULL,
        dedup_key VARCHAR(191) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        resolved_at DATETIME NULL,
        resolved_by VARCHAR(120) NULL,
        UNIQUE KEY uniq_alert_uuid (alert_uuid),
        INDEX idx_alerts_status (status),
        INDEX idx_alerts_type (type),
        INDEX idx_alerts_severity (severity),
        INDEX idx_alerts_container (container_code),
        INDEX idx_alerts_zone (zone(64)),
        INDEX idx_alerts_created (created_at),
        INDEX idx_alerts_dedup (dedup_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[DB] Table alerts prête.');
  } catch (e) {
    console.warn('[DB] alerts :', e.message);
  }

  // --- Phase 3 : conteneurs surveillés ---
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS watched_containers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        container_code VARCHAR(64) NOT NULL,
        created_by VARCHAR(120) NULL,
        reason VARCHAR(255) NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_watched_code (container_code),
        INDEX idx_watched_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[DB] Table watched_containers prête.');
  } catch (e) {
    console.warn('[DB] watched_containers :', e.message);
  }

  // --- Phase 3 : zones attendues par conteneur ---
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS expected_container_zones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        container_code VARCHAR(64) NOT NULL,
        expected_zone VARCHAR(120) NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_expected_code (container_code),
        INDEX idx_expected_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[DB] Table expected_container_zones prête.');
  } catch (e) {
    console.warn('[DB] expected_container_zones :', e.message);
  }

  // --- Phase 4 : notifications multi-canal (sortantes) ---
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS outbound_notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        notification_uuid VARCHAR(64) NOT NULL,
        alert_id INT NULL,
        alert_type VARCHAR(48) NULL,
        severity VARCHAR(16) NULL,
        channel ENUM('whatsapp','email','sms') NOT NULL,
        recipient VARCHAR(191) NULL,
        subject VARCHAR(255) NULL,
        message TEXT NOT NULL,
        status ENUM('pending','sent','failed','skipped') NOT NULL DEFAULT 'pending',
        provider VARCHAR(48) NULL,
        simulated TINYINT(1) NOT NULL DEFAULT 0,
        error_message VARCHAR(512) NULL,
        details_json JSON NULL,
        sent_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_notif_uuid (notification_uuid),
        INDEX idx_notif_alert (alert_id),
        INDEX idx_notif_channel (channel),
        INDEX idx_notif_status (status),
        INDEX idx_notif_type (alert_type),
        INDEX idx_notif_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[DB] Table outbound_notifications prête.');
  } catch (e) {
    console.warn('[DB] outbound_notifications :', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        channel ENUM('whatsapp','email','sms') NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        provider VARCHAR(48) NULL,
        default_recipient VARCHAR(191) NULL,
        config_json JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_channel (channel)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // Amorçage des 3 canaux depuis l'environnement (INSERT IGNORE = idempotent).
    await pool.query(
      `INSERT IGNORE INTO notification_settings (channel, enabled, provider, default_recipient)
       VALUES
         ('whatsapp', ?, ?, ?),
         ('email', ?, ?, ?),
         ('sms', ?, ?, ?)`,
      [
        process.env.WHATSAPP_NOTIFICATIONS_ENABLED === 'true' ? 1 : 0,
        process.env.WHATSAPP_PROVIDER || 'simulation',
        process.env.WHATSAPP_DEFAULT_RECIPIENT || null,
        process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true' ? 1 : 0,
        process.env.EMAIL_PROVIDER || 'simulation',
        process.env.EMAIL_DEFAULT_RECIPIENT || null,
        process.env.SMS_NOTIFICATIONS_ENABLED === 'true' ? 1 : 0,
        process.env.SMS_PROVIDER || 'simulation',
        process.env.SMS_DEFAULT_RECIPIENT || null,
      ]
    );
    console.log('[DB] Table notification_settings prête.');
  } catch (e) {
    console.warn('[DB] notification_settings :', e.message);
  }

  // Phase 7 — Preuves visuelles centralisées.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS visual_proofs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        proof_uuid VARCHAR(40) NOT NULL,
        container_code VARCHAR(64) NULL,
        image_path VARCHAR(512) NULL,
        image_url VARCHAR(512) NULL,
        source VARCHAR(32) NULL,
        camera_id VARCHAR(50) NULL,
        zone VARCHAR(120) NULL,
        captured_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_proof_uuid (proof_uuid),
        INDEX idx_proof_code (container_code),
        INDEX idx_proof_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[DB] Table visual_proofs prête.');
  } catch (e) {
    console.warn('[DB] visual_proofs :', e.message);
  }

  // Phase 6 — Sécurité avancée (RBAC, MFA, audit, refresh, rate-limit).
  await ensureSecuritySchema();
}

/**
 * Applique une liste de fragments ALTER TABLE ... ADD COLUMN de façon idempotente
 * (ignore errno 1060 = colonne déjà existante).
 */
async function addColumns(table, fragments) {
  for (const frag of fragments) {
    try {
      await pool.query(`ALTER TABLE ${table} ${frag}`);
    } catch (e) {
      if (e.errno !== 1060) {
        console.warn(`[DB] Migration ${table} :`, e.message);
      }
    }
  }
}

/**
 * Phase 6 — Tables et colonnes de sécurité (idempotent).
 */
async function ensureSecuritySchema() {
  const rbac = require('./rbac');

  // 1) Tables RBAC.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(48) NOT NULL UNIQUE,
        label VARCHAR(120) NULL,
        description VARCHAR(255) NULL,
        is_system TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(64) NOT NULL UNIQUE,
        label VARCHAR(120) NULL,
        category VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id INT NOT NULL,
        permission_id INT NOT NULL,
        PRIMARY KEY (role_id, permission_id),
        INDEX idx_rp_perm (permission_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        admin_id INT NOT NULL,
        role_id INT NOT NULL,
        PRIMARY KEY (admin_id, role_id),
        INDEX idx_ur_role (role_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[DB] Tables RBAC prêtes (roles, permissions, role_permissions, user_roles).');
  } catch (e) {
    console.warn('[DB] Tables RBAC :', e.message);
  }

  // 2) Journal d'audit.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        audit_uuid VARCHAR(40) NULL,
        admin_id INT NULL,
        actor VARCHAR(191) NULL,
        action VARCHAR(96) NOT NULL,
        resource_type VARCHAR(64) NULL,
        resource_id VARCHAR(96) NULL,
        method VARCHAR(10) NULL,
        path VARCHAR(255) NULL,
        ip_address VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        status VARCHAR(16) NULL DEFAULT 'success',
        details_json JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_action (action),
        INDEX idx_audit_admin (admin_id),
        INDEX idx_audit_status (status),
        INDEX idx_audit_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // Compatibilité avec l'ancien schéma auditService (entity / entity_id).
    await addColumns('audit_logs', [
      'ADD COLUMN audit_uuid VARCHAR(40) NULL',
      'ADD COLUMN admin_id INT NULL',
      'ADD COLUMN resource_type VARCHAR(64) NULL',
      'ADD COLUMN resource_id VARCHAR(96) NULL',
      'ADD COLUMN method VARCHAR(10) NULL',
      'ADD COLUMN path VARCHAR(255) NULL',
      'ADD COLUMN ip_address VARCHAR(64) NULL',
      'ADD COLUMN user_agent VARCHAR(255) NULL',
      "ADD COLUMN status VARCHAR(16) NULL DEFAULT 'success'",
    ]);
    console.log('[DB] Table audit_logs prête.');
  } catch (e) {
    console.warn('[DB] audit_logs :', e.message);
  }

  // 3) Refresh tokens (stockés hachés) + tentatives de connexion.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NOT NULL,
        token_hash VARCHAR(128) NOT NULL,
        expires_at DATETIME NOT NULL,
        revoked TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_rt_admin (admin_id),
        INDEX idx_rt_hash (token_hash)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(191) NULL,
        ip_address VARCHAR(64) NULL,
        success TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_la_email (email),
        INDEX idx_la_ip (ip_address),
        INDEX idx_la_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[DB] Tables refresh_tokens et login_attempts prêtes.');
  } catch (e) {
    console.warn('[DB] refresh_tokens/login_attempts :', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(64) NOT NULL,
        setting_value TEXT NULL,
        updated_by INT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_setting_key (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[DB] Table system_settings prête.');
  } catch (e) {
    console.warn('[DB] system_settings :', e.message);
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS detection_reviews (
        id INT AUTO_INCREMENT PRIMARY KEY,
        detection_id INT NULL,
        container_code VARCHAR(32) NOT NULL,
        action ENUM('confirm','correct','reject') NOT NULL,
        corrected_code VARCHAR(32) NULL,
        admin_id INT NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_dr_code (container_code),
        INDEX idx_dr_detection (detection_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (e) {
    console.warn('[DB] detection_reviews :', e.message);
  }

  // Initialiser password_expires_at pour les comptes existants sans date
  try {
    await pool.query(`
      UPDATE admins
      SET password_changed_at = COALESCE(password_changed_at, created_at, NOW()),
          password_expires_at = COALESCE(password_expires_at, DATE_ADD(COALESCE(password_changed_at, created_at, NOW()), INTERVAL 30 DAY))
      WHERE password_expires_at IS NULL
    `);
  } catch (e) {
    console.warn('[DB] Migration password_expires_at :', e.message);
  }

  // 4) Colonnes MFA / statut sur admins (role passe en VARCHAR pour les nouveaux rôles).
  await addColumns('admins', [
    'ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1',
    'ADD COLUMN mfa_enabled TINYINT(1) NOT NULL DEFAULT 0',
    'ADD COLUMN mfa_secret VARCHAR(64) NULL',
    'ADD COLUMN mfa_pending_secret VARCHAR(64) NULL',
    'ADD COLUMN mfa_backup_codes TEXT NULL',
    'ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0',
    'ADD COLUMN password_changed_at DATETIME NULL',
    'ADD COLUMN password_expires_at DATETIME NULL',
    'ADD COLUMN created_by INT NULL',
    'ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  ]);
  try {
    await pool.query("ALTER TABLE admins MODIFY COLUMN role VARCHAR(32) NOT NULL DEFAULT 'operator'");
  } catch (e) {
    if (e.errno !== 1060) console.warn('[DB] admins.role VARCHAR :', e.message);
  }

  // 5) Traçabilité sur tables existantes.
  await addColumns('alerts', [
    'ADD COLUMN ignored_by VARCHAR(191) NULL',
  ]);
  await addColumns('outbound_notifications', [
    'ADD COLUMN retried_by VARCHAR(191) NULL',
    'ADD COLUMN triggered_by VARCHAR(191) NULL',
  ]);
  await addColumns('vision_uploads', [
    'ADD COLUMN created_by INT NULL',
  ]);
  await addColumns('notification_settings', [
    'ADD COLUMN updated_by VARCHAR(191) NULL',
  ]);

  // 6) Amorçage rôles + permissions (idempotent).
  try {
    for (const r of rbac.ROLES) {
      await pool.query(
        `INSERT INTO roles (name, label, description, is_system) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_system = VALUES(is_system)`,
        [r.name, r.label, r.description, r.is_system]
      );
    }
    for (const p of rbac.PERMISSIONS) {
      await pool.query(
        `INSERT INTO permissions (name, label, category) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE label = VALUES(label), category = VALUES(category)`,
        [p.name, p.label, p.category]
      );
    }
    // role_permissions
    const roleRows = await pool.query('SELECT id, name FROM roles');
    const permRows = await pool.query('SELECT id, name FROM permissions');
    const roleId = {};
    const permId = {};
    (roleRows[0] || roleRows).forEach((r) => { roleId[r.name] = r.id; });
    (permRows[0] || permRows).forEach((p) => { permId[p.name] = p.id; });
    for (const [roleName, perms] of Object.entries(rbac.ROLE_PERMISSIONS)) {
      const rid = roleId[roleName];
      if (!rid) continue;
      for (const perm of perms) {
        const pid = permId[perm];
        if (!pid) continue;
        await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [rid, pid]);
      }
    }
    console.log('[DB] Rôles et permissions amorcés.');

    // 7) Attribution des rôles aux admins existants (idempotent, ne bloque jamais l'accès).
    const adminsRes = await pool.query('SELECT id, email, role FROM admins');
    const admins = adminsRes[0] || adminsRes;
    let hasSuperAdmin = false;
    const urRes = await pool.query(
      `SELECT ur.admin_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'super_admin' LIMIT 1`
    );
    hasSuperAdmin = (urRes[0] || urRes).length > 0;

    for (const a of admins) {
      let targetRole;
      if (String(a.email).toLowerCase() === String(rbac.DEFAULT_SUPER_ADMIN_EMAIL).toLowerCase()) {
        targetRole = 'super_admin';
      } else if (rbac.ROLE_PERMISSIONS[a.role]) {
        targetRole = a.role; // rôle déjà valide (super_admin, admin, operator, analyst, reader)
      } else {
        targetRole = rbac.LEGACY_ROLE_MAP[a.role] || 'operator';
      }
      const rid = roleId[targetRole];
      if (rid) {
        await pool.query('INSERT IGNORE INTO user_roles (admin_id, role_id) VALUES (?, ?)', [a.id, rid]);
        if (targetRole === 'super_admin') hasSuperAdmin = true;
      }
    }

    // Filet de sécurité : garantir au moins un super_admin.
    if (!hasSuperAdmin && admins.length > 0) {
      const rid = roleId['super_admin'];
      const first = admins[0];
      if (rid && first) {
        await pool.query('INSERT IGNORE INTO user_roles (admin_id, role_id) VALUES (?, ?)', [first.id, rid]);
        console.log(`[DB] Super Admin de secours attribué à admin #${first.id}.`);
      }
    }
    console.log('[DB] Attribution des rôles aux administrateurs vérifiée.');
  } catch (e) {
    console.warn('[DB] Amorçage RBAC :', e.message);
  }
}

module.exports = { ensureSchema, ensureSecuritySchema };
