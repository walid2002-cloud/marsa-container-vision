-- ============================================
-- Marsa Container Vision - Script d'initialisation
-- Base de données : marsa_container_db
-- ============================================

CREATE DATABASE IF NOT EXISTS marsa_container_db;
USE marsa_container_db;

-- Table des administrateurs
CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'operator') NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table des caméras de surveillance
CREATE TABLE IF NOT EXISTS cameras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    camera_name VARCHAR(50) NOT NULL UNIQUE,
    zone VARCHAR(100) NOT NULL,
    stream_url VARCHAR(255) DEFAULT NULL,
    status ENUM('active', 'inactive', 'maintenance') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table des détections de conteneurs
CREATE TABLE IF NOT EXISTS detections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    container_code VARCHAR(50) NOT NULL,
    detected BOOLEAN NOT NULL DEFAULT FALSE,
    camera_name VARCHAR(50) DEFAULT NULL,
    zone VARCHAR(100) DEFAULT NULL,
    confidence DECIMAL(5,4) DEFAULT 0.0000,
    image_path VARCHAR(255) DEFAULT NULL,
    detected_at DATETIME DEFAULT NULL,
    global_confidence DECIMAL(7,4) NULL,
    yolo_confidence DECIMAL(7,4) NULL,
    yolo_detected TINYINT(1) NULL,
    annotated_path VARCHAR(512) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_container_code (container_code),
    INDEX idx_detected_at (detected_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(64) NOT NULL DEFAULT 'info',
    title VARCHAR(255) NOT NULL,
    message TEXT,
    payload TEXT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notifications_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Table de l'historique des recherches
CREATE TABLE IF NOT EXISTS search_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    searched_code VARCHAR(50) NOT NULL,
    result ENUM('detected', 'not_detected') NOT NULL,
    detection_id INT DEFAULT NULL,
    admin_id INT DEFAULT NULL,
    source VARCHAR(64) NULL DEFAULT 'manual',
    global_confidence DECIMAL(7,4) NULL,
    evidence_path VARCHAR(512) NULL,
    searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_searched_code (searched_code),
    INDEX idx_searched_at (searched_at),
    FOREIGN KEY (detection_id) REFERENCES detections(id) ON DELETE SET NULL,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================
-- Données de démonstration
-- ============================================

-- Admin de démonstration
-- Email : admin@marsamaroc.com / Mot de passe : admin123
-- Hash bcrypt généré avec bcryptjs (10 rounds)
INSERT INTO admins (full_name, email, password_hash, role) VALUES
    ('Walid Boudarra', 'admin@marsamaroc.com', '$2b$10$XeptYEhdxv3kYpgXu69KVukcB/GHQe0YZJxoMw9jXyzA5q2UtAm/W', 'admin');

-- Caméras de démonstration
INSERT INTO cameras (camera_name, zone, stream_url, status) VALUES
    ('CAM_01', 'Zone A - Quai Nord',    'rtsp://192.168.1.101:554/stream', 'active'),
    ('CAM_02', 'Zone B - Quai Sud',     'rtsp://192.168.1.102:554/stream', 'active'),
    ('CAM_03', 'Zone C - Aire de stockage', 'rtsp://192.168.1.103:554/stream', 'active'),
    ('CAM_04', 'Zone D - Entrée terminale', 'rtsp://192.168.1.104:554/stream', 'active'),
    ('CAM_05', 'Zone E - Sortie terminale', 'rtsp://192.168.1.105:554/stream', 'maintenance');
