// backend/db.js
const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost',     // your DB host
    user: 'root',          // your DB username
    password: 'michat162004',  // your DB password
    database: 'calmnest'   // your DB name
});

connection.connect((err) => {
    if (err) {
        console.error('Database connection failed: ' + err.stack);
        return;
    }
    console.log('Connected to database.');
});

module.exports = connection;
