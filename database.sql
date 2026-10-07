-- Paycheck Payoff Planner: email signups with what each person entered and the results they saw.
-- Import into your Hostinger MySQL database with phpMyAdmin (Import tab). Works on MySQL 5.7+ and MariaDB 10.3+.

CREATE TABLE IF NOT EXISTS signups (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email                 VARCHAR(254)  NOT NULL,
  created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  kit_status            ENUM('sent', 'failed') NOT NULL DEFAULT 'failed' COMMENT 'Whether Kit accepted the signup',

  -- Page 1: money in & out
  pay_per_paycheck      DECIMAL(12,2) NOT NULL DEFAULT 0,
  pay_frequency         ENUM('weekly', 'biweekly', 'monthly') NOT NULL DEFAULT 'biweekly',
  monthly_income        DECIMAL(12,2) NOT NULL DEFAULT 0,
  monthly_expenses      DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_debt            DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Page 2: the plan
  payoff_months         TINYINT UNSIGNED NOT NULL DEFAULT 36,
  invest_monthly        DECIMAL(12,2) NULL COMMENT 'NULL when investing was turned off',
  save_monthly          DECIMAL(12,2) NULL COMMENT 'NULL when savings was turned off',
  savings_goal          DECIMAL(12,2) NULL,

  -- Page 3: results
  monthly_debt_payment  DECIMAL(12,2) NOT NULL DEFAULT 0,
  interest_saved        DECIMAL(12,2) NOT NULL DEFAULT 0,
  interest_paid         DECIMAL(12,2) NOT NULL DEFAULT 0,
  investments_value     DECIMAL(12,2) NULL,
  savings_value         DECIMAL(12,2) NULL,
  leftover_monthly      DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'Negative means over budget',
  debt_free_date        DATE NULL,

  PRIMARY KEY (id),
  KEY idx_email (email),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS signup_debts (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  signup_id  INT UNSIGNED NOT NULL,
  debt_type  ENUM('Credit card', 'Auto loan', 'Student loans', 'Other') NOT NULL DEFAULT 'Credit card',
  balance    DECIMAL(12,2) NOT NULL DEFAULT 0,
  apr        DECIMAL(5,2)  NOT NULL DEFAULT 24.00,
  PRIMARY KEY (id),
  KEY idx_signup (signup_id),
  CONSTRAINT fk_signup_debts_signup FOREIGN KEY (signup_id) REFERENCES signups (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
