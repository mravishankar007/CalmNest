require('dotenv').config(); // load .env for API key
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./db'); // your existing DB setup
const OpenAI = require("openai");
const multer = require('multer');
const app = express();
const PORT = 3000;

// OpenAI setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// Session setup
app.use(session({
  secret: 'my_super_secret_demo_key', // replace with a strong random string
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

// Mood scale
const moodScale = { "Depressed": 0, "Sad": 1, "Angry": 2, "Anxious": 3, "Neutral": 4, "Happy": 5 };

// ---------- AUTH ROUTES ----------
app.post('/signup', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.json({ success: false, error: "All fields required" });

  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.json({ success: false, error: 'Error hashing password' });

    db.query('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, hash], (err) => {
      if (err) return res.json({ success: false, error: err.message });
      res.json({ success: true });
    });
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err) return res.json({ success: false, error: 'Database error' });
    if (results.length === 0) return res.json({ success: false, error: "No account found" });

    const user = results[0];
    bcrypt.compare(password, user.password_hash, (err, match) => {
      if (err) return res.json({ success: false, error: 'Error comparing passwords' });
      if (match) {
        req.session.user = { id: user.id, username: user.username, email: user.email };
        return res.json({ success: true, username: user.username });
      } else {
        return res.json({ success: false, error: 'Wrong password' });
      }
    });
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/check-session', (req, res) => {
  if (req.session.user) return res.json({ loggedIn: true, user: req.session.user });
  res.json({ loggedIn: false });
});

// Auth middleware
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  next();
}

// ---------- MOOD HISTORY ----------
app.get('/mood-history', requireLogin, (req, res) => {
  const user_id = req.session.user.id;
  db.query('SELECT * FROM moods WHERE user_id=? ORDER BY date_time ASC', [user_id], (err, results) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    const data = results.map(r => ({ ...r, mood_value: moodScale[r.mood] ?? 0 }));
    res.json(data);
  });
});

app.post('/add-mood', requireLogin, (req, res) => {
  const { mood } = req.body;
  const user_id = req.session.user.id;
  if (!mood) return res.status(400).json({ error: 'Mood not provided' });

  db.query('INSERT INTO moods (user_id, mood) VALUES (?, ?)', [user_id, mood], (err) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true });
  });
});

// ---------- AI RECOMMENDATION ----------
app.post('/recommend', requireLogin, async (req, res) => {
  const { mood, note } = req.body;
  if (!mood) return res.status(400).json({ error: 'Mood not provided' });

  const prompt = `
You are CalmNest, a compassionate AI assistant.
User mood: ${mood}
User note: "${note || ''}"

Provide 1-2 short, empathetic, and personalized recommendations or actions the user can take.
Return JSON array like: ["Recommendation 1", "Recommendation 2"].
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 150
    });

    let text = response.choices[0].message.content.trim();
    let recommendations;
    try { recommendations = JSON.parse(text); } catch { recommendations = [text]; }

    res.json({ recommendations });

  } catch (err) {
    console.error("OpenAI API error:", err);
    res.status(500).json({ error: "AI service unavailable" });
  }
});

// ---------- POEM SUBMISSION ----------
app.post('/submit-poem', requireLogin, (req, res) => {
  const { title, content } = req.body;
  const user_id = req.session.user.id;

  if (!title || !content) return res.status(400).json({ success: false, error: 'Title and content required' });

  db.query('INSERT INTO poems (user_id, title, content) VALUES (?, ?, ?)',
    [user_id, title, content],
  (err,result)=>{
   if(err){
        console.error('Poem insert error:', err); // check this in terminal
        return res.status(500).json({ success:false, error:'Database Error: '+err.message });
      }
      res.json({ success:true, message:'Poem submitted successfully!' });
    }
  );
});
// Get all poems (or user's poems)
app.get('/poems', (req, res) => {
  db.query(
    `SELECT poems.id, poems.title, poems.content, poems.created_at, users.username
     FROM poems
     JOIN users ON poems.user_id = users.id
     ORDER BY poems.created_at DESC`,
    (err, results) => {
      if (err) {
        console.error('Error fetching poems:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ success: true, poems: results });
    }
  );
});

// ---------- ART SUBMISSION ----------
const upload = multer({ dest: path.join(__dirname, '../public/uploads/') });

app.post('/submit-art', requireLogin, upload.single('artFile'), (req, res) => {
  const user_id = req.session.user.id;
  const { artTitle } = req.body;
  const filename = req.file.filename;

  db.query('INSERT INTO art (user_id, title, filename) VALUES (?, ?, ?)',
    [user_id, artTitle, filename],
    (err) => {
      if (err) return res.status(500).json({ success: false, error: 'DB error' });
      res.json({ success: true });
    });
});
// Get all art submissions
app.get('/art', (req, res) => {
  db.query(
    `SELECT art.id, art.title, art.filename, art.created_at, users.username
     FROM art
     JOIN users ON art.user_id = users.id
     ORDER BY art.created_at DESC`,
    (err, results) => {
      if(err){
        console.error('Error fetching art:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      res.json({ success: true, art: results });
    }
  );
});
const journalRoutes = require('./routes/journalRoutes');
app.use('/', journalRoutes);



// ---------- THREAD ROUTES (updated for categories) ----------

// Get all threads (or optionally by category)
app.get('/threads', (req, res) => {
  const { category } = req.query; // allow ?category=Better Sleep filtering

  let sql = `
    SELECT threads.id, threads.title, threads.content, threads.category,
           threads.created_at, users.username
    FROM threads
    JOIN users ON threads.user_id = users.id
  `;
  const params = [];

  if (category) {
    sql += " WHERE threads.category = ?";
    params.push(category);
  }

  sql += " ORDER BY threads.created_at DESC";

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("Error fetching threads:", err);
      return res.status(500).json({ success: false, error: "Database error" });
    }
    res.json({ success: true, threads: results });
  });
});

// Post a new thread
app.post('/submit-thread', requireLogin, (req, res) => {
  const user_id = req.session.user.id;
  const { title, content, category } = req.body;

  if (!title || !content || !category)
    return res.status(400).json({ success: false, error: "Title, content, and category required" });

  const sql = "INSERT INTO threads (user_id, title, content, category) VALUES (?, ?, ?, ?)";
  db.query(sql, [user_id, title, content, category], (err) => {
    if (err) {
      console.error("Error inserting thread:", err);
      return res.status(500).json({ success: false, error: "Database error: " + err.message });
    }
    res.json({ success: true, message: "Thread posted successfully!" });
  });
});

// ---------- SERVE HTML ----------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
app.get('/:page', (req, res) => {
  const page = req.params.page;
  const filePath = path.join(__dirname, '../public', `${page}.html`);
  res.sendFile(filePath, (err) => { if (err) res.status(404).send('Page not found'); });
});

// ---------- DEBUG ----------
app.get('/debug-session', (req, res) => {
  console.log('Session object:', req.session);
  res.json(req.session);
});

// ---------- START SERVER ----------
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
