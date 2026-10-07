<?php
// Saves each email wall signup, with what the visitor entered and their results, to MySQL (tables in database.sql).
// Kit itself is handled in the browser by Kit's embed script.
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['error' => 'Use POST.']);
}

$config = require __DIR__ . '/config.php';
$raw = file_get_contents('php://input', false, null, 0, 20000);
$data = json_decode($raw ?: '', true);
if (!is_array($data)) {
    respond(400, ['error' => 'Enter a valid email address, like name@example.com.']);
}

$email = trim((string)($data['email'] ?? ''));

// Developer code: open the results without subscribing or saving
$devCode = strtoupper(trim((string)($config['dev_code'] ?? '')));
if ($devCode !== '' && strtoupper($email) === $devCode) {
    respond(200, ['ok' => true, 'dev' => true]);
}

if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(400, ['error' => 'Enter a valid email address, like name@example.com.']);
}

/* ---------- Kit ---------- */
// Kit's own script (ck.5.js) sends the email to Kit in the browser; the page reports how that went.
$kitStatus = (($data['kit'] ?? '') === 'sent') ? 'sent' : 'failed';

/* ---------- Clean up the numbers sent by the page ---------- */
$in  = is_array($data['inputs'] ?? null) ? $data['inputs'] : [];
$out = is_array($data['results'] ?? null) ? $data['results'] : [];

// Money: a finite number within a sane range, rounded to cents. null stays null when allowed.
$money = function ($v, bool $nullable = false) {
    if ($v === null || $v === '') return $nullable ? null : 0.0;
    if (!is_numeric($v)) return $nullable ? null : 0.0;
    $n = (float)$v;
    if (!is_finite($n)) return $nullable ? null : 0.0;
    return round(max(-9999999999.0, min(9999999999.0, $n)), 2);
};
$freq = in_array($in['payFrequency'] ?? '', ['weekly', 'biweekly', 'monthly'], true) ? $in['payFrequency'] : 'biweekly';
$months = max(3, min(60, (int)($in['payoffMonths'] ?? 36)));
$debtFree = (isset($out['debtFreeDate']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$out['debtFreeDate']))
    ? $out['debtFreeDate'] : null;

$debts = [];
$types = ['Credit card', 'Auto loan', 'Student loans', 'Other'];
foreach (array_slice(is_array($in['debts'] ?? null) ? $in['debts'] : [], 0, 25) as $d) {
    if (!is_array($d)) continue;
    $balance = $money($d['balance'] ?? 0);
    if ($balance <= 0) continue;
    $debts[] = [
        'type'    => in_array($d['type'] ?? '', $types, true) ? $d['type'] : 'Other',
        'balance' => $balance,
        'apr'     => max(0, min(999.99, (float)$money($d['apr'] ?? 0))),
    ];
}

/* ---------- Save ---------- */
try {
    $pdo = new PDO(
        "mysql:host={$config['db_host']};dbname={$config['db_name']};charset=utf8mb4",
        $config['db_user'],
        $config['db_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]
    );
    $pdo->beginTransaction();

    $stmt = $pdo->prepare(
        'INSERT INTO signups
          (email, kit_status, pay_per_paycheck, pay_frequency, monthly_income, monthly_expenses, total_debt,
           payoff_months, invest_monthly, save_monthly, savings_goal,
           monthly_debt_payment, interest_saved, interest_paid, investments_value, savings_value,
           leftover_monthly, debt_free_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $email, $kitStatus,
        $money($in['payPerPaycheck'] ?? 0), $freq,
        $money($in['monthlyIncome'] ?? 0), $money($in['monthlyExpenses'] ?? 0), $money($in['totalDebt'] ?? 0),
        $months,
        $money($in['investMonthly'] ?? null, true), $money($in['saveMonthly'] ?? null, true), $money($in['savingsGoal'] ?? null, true),
        $money($out['monthlyDebtPayment'] ?? 0), $money($out['interestSaved'] ?? 0), $money($out['interestPaid'] ?? 0),
        $money($out['investmentsValue'] ?? null, true), $money($out['savingsValue'] ?? null, true),
        $money($out['leftoverMonthly'] ?? 0), $debtFree,
    ]);
    $signupId = (int)$pdo->lastInsertId();

    if ($debts) {
        $debtStmt = $pdo->prepare('INSERT INTO signup_debts (signup_id, debt_type, balance, apr) VALUES (?, ?, ?, ?)');
        foreach ($debts as $d) {
            $debtStmt->execute([$signupId, $d['type'], $d['balance'], $d['apr']]);
        }
    }
    $pdo->commit();
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    error_log('Signup save failed: ' . $e->getMessage());
    // The visitor still gets their results; the failure is in the server's error log
    respond(200, ['ok' => true, 'saved' => false, 'kit' => $kitStatus]);
}

respond(200, ['ok' => true, 'saved' => true, 'kit' => $kitStatus]);
