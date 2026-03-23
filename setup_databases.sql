

-- ── 1. AUTH DATABASE ─────────────────────────────────────
CREATE DATABASE IF NOT EXISTS auth_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE auth_db;

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100)        NOT NULL,
  email         VARCHAR(150)        NOT NULL UNIQUE,
  password_hash VARCHAR(255)        NOT NULL,
  role          ENUM('admin','user') NOT NULL DEFAULT 'user',
  avatar_url    VARCHAR(300)        DEFAULT NULL,
  created_at    TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email)
);

-- NextAuth sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT          NOT NULL,
  session_token VARCHAR(255) NOT NULL UNIQUE,
  expires       DATETIME     NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token (session_token)
);

-- ── 2. NEPSE DATABASE ─────────────────────────────────────
CREATE DATABASE IF NOT EXISTS nepse_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE nepse_db;

CREATE TABLE IF NOT EXISTS sector (
  sector_id   INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS company (
  company_id   INT AUTO_INCREMENT PRIMARY KEY,
  symbol       VARCHAR(20)  NOT NULL UNIQUE,
  name         VARCHAR(150) NOT NULL,
  sector_id    INT          NOT NULL DEFAULT 1,
  listed_date  DATE         DEFAULT NULL,
  total_shares BIGINT       DEFAULT NULL,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  FOREIGN KEY (sector_id) REFERENCES sector(sector_id),
  INDEX idx_symbol (symbol),
  INDEX idx_sector (sector_id, is_active)
);

CREATE TABLE IF NOT EXISTS trading_session (
  session_id   INT  AUTO_INCREMENT PRIMARY KEY,
  trading_date DATE NOT NULL UNIQUE,
  open_time    TIME DEFAULT '11:00:00',
  close_time   TIME DEFAULT '15:00:00',
  is_holiday   TINYINT(1) NOT NULL DEFAULT 0,
  remarks      VARCHAR(200) DEFAULT NULL,
  INDEX idx_date (trading_date)
);

CREATE TABLE IF NOT EXISTS price_data (
  price_id       INT  AUTO_INCREMENT PRIMARY KEY,
  company_id     INT  NOT NULL,
  session_id     INT  NOT NULL,
  open_price     DECIMAL(10,2) NOT NULL,
  high_price     DECIMAL(10,2) NOT NULL,
  low_price      DECIMAL(10,2) NOT NULL,
  close_price    DECIMAL(10,2) NOT NULL,
  volume         BIGINT        NOT NULL,
  turnover       DECIMAL(14,2) DEFAULT NULL,
  prev_close     DECIMAL(10,2) DEFAULT NULL,
  percent_change DECIMAL(6,2)  DEFAULT NULL,
  UNIQUE KEY uq_company_session (company_id, session_id),
  FOREIGN KEY (company_id) REFERENCES company(company_id),
  FOREIGN KEY (session_id) REFERENCES trading_session(session_id),
  INDEX idx_company_date (company_id, session_id)
);

CREATE TABLE IF NOT EXISTS data_source (
  source_id    INT AUTO_INCREMENT PRIMARY KEY,
  price_id     INT          NOT NULL UNIQUE,
  source_name  VARCHAR(80)  NOT NULL DEFAULT 'sharesansar.com',
  entered_by   VARCHAR(80)  DEFAULT NULL,
  entered_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  entry_method VARCHAR(30)  DEFAULT 'csv_upload',
  FOREIGN KEY (price_id) REFERENCES price_data(price_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS watchlist (
  watchlist_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT          NOT NULL,
  company_id   INT          NOT NULL,
  added_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes        TEXT         DEFAULT NULL,
  UNIQUE KEY uq_user_company (user_id, company_id),
  FOREIGN KEY (company_id) REFERENCES company(company_id) ON DELETE CASCADE
);

-- ── 3. SEED SECTORS ──────────────────────────────────────
USE nepse_db;
INSERT IGNORE INTO sector (name) VALUES
  ('Commercial Bank'),
  ('Corporate Debentures'),
  ('Development Bank'),
  ('Finance'),
  ('Government Bonds'),
  ('Hotel & Tourism'),
  ('Hydropower'),
  ('Investment'),
  ('Life Insurance'),
  ('Manufacturing and Processing'),
  ('Microfinance'),
  ('Mutual Fund'),
  ('Non-Life Insurance'),
  ('Others'),
  ('Preference Share'),
  ('Promoter Share'),
  ('Trading');

-- ── 4. USEFUL VIEWS ──────────────────────────────────────
USE nepse_db;

-- Latest price for every active company
CREATE OR REPLACE VIEW v_latest_prices AS
SELECT
  c.company_id,
  c.symbol,
  c.name,
  s.name          AS sector,
  p.close_price,
  p.open_price,
  p.high_price,
  p.low_price,
  p.volume,
  p.turnover,
  p.prev_close,
  p.percent_change,
  t.trading_date
FROM price_data p
JOIN company        c ON p.company_id = c.company_id
JOIN sector         s ON c.sector_id  = s.sector_id
JOIN trading_session t ON p.session_id = t.session_id
WHERE t.trading_date = (
  SELECT MAX(trading_date)
  FROM trading_session
  WHERE is_holiday = 0
)
AND c.is_active = 1;

-- 52-week high/low per company
CREATE OR REPLACE VIEW v_52week_range AS
SELECT
  c.symbol,
  c.name,
  MAX(p.high_price) AS week52_high,
  MIN(p.low_price)  AS week52_low,
  COUNT(*)          AS trading_days
FROM price_data p
JOIN company        c ON p.company_id = c.company_id
JOIN trading_session t ON p.session_id  = t.session_id
WHERE t.trading_date >= DATE_SUB(CURDATE(), INTERVAL 52 WEEK)
GROUP BY c.company_id, c.symbol, c.name;

SELECT 'Databases created successfully.' AS status;
