-- cipher.ink tables (MySQL 8). Structure only, from release 20261026b.
CREATE TABLE `cipher_enc` (
  `iv` char(16) NOT NULL,
  `enc` blob,
  PRIMARY KEY (`iv`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
CREATE TABLE `cipher_msg` (
  `id` varchar(16) NOT NULL,
  `payload` mediumtext NOT NULL,
  `mode` char(1) NOT NULL DEFAULT 'p',
  `state` varchar(10) NOT NULL DEFAULT 'live',
  `hint` varchar(700) DEFAULT NULL COMMENT 'base64 of UTF-8; shown unencrypted on the lock card',
  `files` tinyint unsigned NOT NULL DEFAULT '0',
  `burn` tinyint NOT NULL DEFAULT '0',
  `del` char(64) DEFAULT NULL,
  `created` int unsigned NOT NULL,
  `expires` int unsigned NOT NULL DEFAULT '0',
  `opened_at` int unsigned NOT NULL DEFAULT '0',
  `opens` int unsigned NOT NULL DEFAULT '0',
  `ended_at` int unsigned NOT NULL DEFAULT '0',
  `grp` varchar(16) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `expires` (`expires`),
  KEY `state_ended` (`state`,`ended_at`),
  KEY `grp` (`grp`)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;
CREATE TABLE `cipher_file` (
  `msg_id` varchar(16) NOT NULL,
  `n` tinyint unsigned NOT NULL,
  `data` longblob NOT NULL,
  PRIMARY KEY (`msg_id`,`n`)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;
CREATE TABLE `cipher_rate` (
  `k` char(64) NOT NULL,
  `hour` int unsigned NOT NULL,
  `creates` int unsigned NOT NULL DEFAULT '0',
  `bytes` bigint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`k`,`hour`)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;
CREATE TABLE `cipher_group` (
  `id` varchar(16) NOT NULL,
  `admin` mediumtext NOT NULL,
  `adm` char(64) NOT NULL,
  `cards` tinyint unsigned NOT NULL,
  `created` int NOT NULL,
  `expires` int NOT NULL,
  `state` varchar(10) NOT NULL DEFAULT 'live',
  PRIMARY KEY (`id`),
  KEY `expires` (`expires`)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;
CREATE TABLE `cipher_slot` (
  `id` varchar(16) NOT NULL,
  `grp` varchar(16) NOT NULL,
  `payload` mediumtext NOT NULL,
  `wkey` char(64) NOT NULL,
  `tkey` char(64) NOT NULL,
  `updated` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `grp` (`grp`)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;
CREATE TABLE `cipher_note` (
  `slot` varchar(16) NOT NULL,
  `seq` smallint unsigned NOT NULL,
  `payload` text NOT NULL,
  `created` int NOT NULL,
  PRIMARY KEY (`slot`,`seq`)
) ENGINE=InnoDB DEFAULT CHARSET=ascii;
