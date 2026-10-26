<?php
// Behind Cloudflare's proxy the connecting peer (REMOTE_ADDR) is a Cloudflare edge address, and the visitor's own address arrives in the
// CF-Connecting-IP header. Every per-IP rule here (the seal/contact/Santa rate limits in lib.php, the /fb allow-list in fb.php) reads
// REMOTE_ADDR, so lib.php includes this file first thing and it puts the visitor's address back into REMOTE_ADDR.
//
// The header is believed ONLY when the peer is inside Cloudflare's published ranges; from anyone else it is trivially forged and is
// ignored. A garbage or empty header leaves REMOTE_ADDR alone. The peer's own address is kept in $_SERVER['CI_PEER_ADDR'].
//
// The ranges are Cloudflare's, fetched 2026-10-26 from https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6.
// They change rarely; to refresh, fetch both lists again, replace the arrays below and the date above, then run tests/cfip.sh.

function ci_cf_ranges() {
  return array(
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32'
  );
}

// True if the address (v4 or v6; an IPv4-mapped v6 address counts as its v4) is inside the CIDR.
function ci_ip_in_cidr($ip, $cidr) {
  $a = inet_pton($ip);
  if ($a === false) return false;
  if (strlen($a) === 16 && substr($a, 0, 12) === "\0\0\0\0\0\0\0\0\0\0\xff\xff") $a = substr($a, 12);
  list($net, $bits) = explode('/', $cidr);
  $n = inet_pton($net);
  if ($n === false || strlen($n) !== strlen($a)) return false;
  $bits = (int)$bits;
  $whole = intdiv($bits, 8); $rest = $bits % 8;
  if ($whole > 0 && substr($a, 0, $whole) !== substr($n, 0, $whole)) return false;
  if ($rest === 0) return true;
  $mask = (0xff << (8 - $rest)) & 0xff;
  return ((ord($a[$whole]) & $mask) === (ord($n[$whole]) & $mask));
}

function ci_is_cloudflare($ip) {
  if (!is_string($ip) || filter_var($ip, FILTER_VALIDATE_IP) === false) return false;
  foreach (ci_cf_ranges() as $cidr) if (ci_ip_in_cidr($ip, $cidr)) return true;
  return false;
}

// The visitor's address: the header when the peer is Cloudflare and the header is one valid IP, else the peer.
function ci_client_ip($peer, $header) {
  if (is_string($header) && is_string($peer) && ci_is_cloudflare($peer)) {
    $h = trim($header);
    if (filter_var($h, FILTER_VALIDATE_IP) !== false) return $h;
  }
  return is_string($peer) ? $peer : '';
}

if (isset($_SERVER['REMOTE_ADDR']) && !isset($_SERVER['CI_PEER_ADDR'])) {
  $_SERVER['CI_PEER_ADDR'] = $_SERVER['REMOTE_ADDR'];
  $_SERVER['REMOTE_ADDR'] = ci_client_ip($_SERVER['REMOTE_ADDR'], isset($_SERVER['HTTP_CF_CONNECTING_IP']) ? $_SERVER['HTTP_CF_CONNECTING_IP'] : null);
}
