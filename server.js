const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage (replace with database in production)
let signals = [];
let trades = [];
let users = [];

// Webhook endpoint for TradingView
app.post('/webhook/tradingview', (req, res) => {
    try {
        console.log('Webhook received:', req.body);
        
        // Verify webhook authenticity (optional but recommended)
        const expectedSecret = process.env.TRADINGVIEW_WEBHOOK_SECRET || 'webhook-secret-2024';
        const providedAuth = req.body.auth_token;
        
        if (!providedAuth) {
            return res.status(401).json({ error: 'Authentication token required' });
        }
        
        // Create new signal from TradingView data
        const signal = {
            id: Date.now().toString(),
            ticker: req.body.ticker || 'UNKNOWN',
            action: req.body.action || 'buy', // 'buy' or 'sell'
            price: parseFloat(req.body.price) || 0,
            timestamp: new Date(req.body.timestamp || Date.now()),
            received_at: new Date(),
            analyzed: false,
            analyzed_by: null,
            analyzed_at: null,
            response_time_seconds: null
        };
        
        // Store signal
        signals.unshift(signal); // Add to beginning of array
        
        console.log('Signal processed:', signal);
        
        // Send success response quickly (TradingView has 3-second timeout)
        res.status(200).json({ 
            success: true, 
            message: 'Signal received and processed',
            signal_id: signal.id 
        });
        
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all signals
app.get('/api/signals', (req, res) => {
    res.json(signals);
});

// Get pending (unanalyzed) signals
app.get('/api/signals/pending', (req, res) => {
    const pendingSignals = signals.filter(signal => !signal.analyzed);
    res.json(pendingSignals);
});

// Mark signal as being analyzed
app.post('/api/signals/:id/analyze', (req, res) => {
    const { id } = req.params;
    const { user_name } = req.body;
    
    const signal = signals.find(s => s.id === id);
    if (!signal) {
        return res.status(404).json({ error: 'Signal not found' });
    }
    
    if (signal.analyzed) {
        return res.status(400).json({ error: 'Signal already analyzed' });
    }
    
    // Calculate response time
    const responseTime = (new Date() - signal.received_at) / 1000; // seconds
    
    // Update signal
    signal.analyzed = true;
    signal.analyzed_by = user_name || 'Anonymous';
    signal.analyzed_at = new Date();
    signal.response_time_seconds = responseTime;
    
    res.json({ 
        success: true, 
        signal: signal,
        response_time_seconds: responseTime 
    });
});

// Create new trade entry
app.post('/api/trades', (req, res) => {
    const trade = {
        id: Date.now().toString(),
        signal_id: req.body.signal_id || null,
        pair: req.body.pair,
        direction: req.body.direction, // 'long' or 'short'
        entry_price: parseFloat(req.body.entry_price),
        exit_price: parseFloat(req.body.exit_price) || null,
        stop_loss: parseFloat(req.body.stop_loss) || null,
        take_profit: parseFloat(req.body.take_profit) || null,
        reasoning: req.body.reasoning || '',
        voice_note_url: req.body.voice_note_url || null,
        screenshot_url: req.body.screenshot_url || null,
        result: req.body.result || 'pending', // 'win', 'loss', 'pending'
        pips: parseFloat(req.body.pips) || 0,
        created_by: req.body.created_by || 'Anonymous',
        created_at: new Date(),
        updated_at: new Date()
    };
    
    trades.unshift(trade);
    res.json({ success: true, trade: trade });
});

// Get all trades
app.get('/api/trades', (req, res) => {
    res.json(trades);
});

// Get response time leaderboard
app.get('/api/leaderboard', (req, res) => {
    const analyzedSignals = signals.filter(s => s.analyzed && s.response_time_seconds);
    
    // Group by user and calculate average response time
    const userStats = {};
    analyzedSignals.forEach(signal => {
        if (!userStats[signal.analyzed_by]) {
            userStats[signal.analyzed_by] = {
                user: signal.analyzed_by,
                total_signals: 0,
                total_response_time: 0,
                fastest_response: null,
                slowest_response: null
            };
        }
        
        const stats = userStats[signal.analyzed_by];
        stats.total_signals++;
        stats.total_response_time += signal.response_time_seconds;
        
        if (!stats.fastest_response || signal.response_time_seconds < stats.fastest_response) {
            stats.fastest_response = signal.response_time_seconds;
        }
        
        if (!stats.slowest_response || signal.response_time_seconds > stats.slowest_response) {
            stats.slowest_response = signal.response_time_seconds;
        }
    });
    
    // Calculate averages and sort by fastest average
    const leaderboard = Object.values(userStats).map(stats => ({
        ...stats,
        average_response_time: stats.total_response_time / stats.total_signals
    })).sort((a, b) => a.average_response_time - b.average_response_time);
    
    res.json(leaderboard);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date(),
        signals_count: signals.length,
        trades_count: trades.length
    });
});

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Test webhook endpoint (for manual testing)
app.post('/test-webhook', (req, res) => {
    console.log('Test webhook called');
    
    // Simulate TradingView signal
    const testSignal = {
        ticker: 'EURUSD',
        action: 'buy',
        price: 1.0850,
        timestamp: new Date().toISOString(),
        auth_token: 'test-token'
    };
    
    // Process through webhook
    fetch('/webhook/tradingview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testSignal)
    });
    
    res.json({ message: 'Test signal sent', signal: testSignal });
});

app.listen(PORT, () => {
    console.log(`Trading Journal server running on port ${PORT}`);
    console.log(`Webhook URL: http://localhost:${PORT}/webhook/tradingview`);
    console.log(`Dashboard: http://localhost:${PORT}`);
});
