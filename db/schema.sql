CREATE TABLE IF NOT EXISTS users (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 email VARCHAR(100) NOT NULL UNIQUE,
 password VARCHAR(255) NOT NULL,
 role ENUM('student','admin') DEFAULT 'student'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS equipment (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 category VARCHAR(100) NOT NULL,
 quantity INT NOT NULL DEFAULT 0,
 description TEXT,
 status ENUM('available','unavailable') DEFAULT 'available'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS borrow_requests (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 borrow_date DATE NOT NULL,
 return_date DATE NOT NULL,
 status ENUM('pending','approved','borrowed','rejected','cancelled','returned') DEFAULT 'pending',
 note TEXT,
 FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS borrow_details (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 request_id INT NOT NULL,
 equipment_id INT NOT NULL,
 quantity INT NOT NULL DEFAULT 1,
 FOREIGN KEY (request_id) REFERENCES borrow_requests(id),
 FOREIGN KEY (equipment_id) REFERENCES equipment(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS sessions (
 sid VARCHAR(64) NOT NULL PRIMARY KEY,
 user_id INT NULL,
 csrf VARCHAR(64) NOT NULL,
 expires_at DATETIME NOT NULL,
 INDEX sessions_expiry (expires_at),
 FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
