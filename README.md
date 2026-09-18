# 🎮 LuckyWin - 1win Style iGaming Platform (Option A)

Custom-built high-performance iGaming web platform featuring **Lucky Jet (Crash Game)**, **Mines (5x5)**, **Provably Fair SHA-256 verification**, **Cashier Desk (EasyPaisa, JazzCash, Meezan Bank, USDT Crypto)**, and a full **Super Admin Back Office**.

---

## 🌟 Key Features

### 1. 🚀 Lucky Jet / Aviator Crash Game
* Real-time WebSocket game loop ticking at 50ms (20 ticks/sec).
* Exponential multiplier curve from $1.00\times$ to $100.00\times+$.
* 1win signature **Dual Bet Panels** (side-by-side) with manual & auto-cashout controls.
* Top **Multiplier History Ribbon** with color-coded badges ($<2\times$ blue, $2\times-10\times$ purple, $>10\times$ gold).
* **Live Multiplayer Feed** with real-time player bet cards and cashouts.

### 2. 💎 Mines Game (5x5 Grid)
* 25 interactive tiles with customizable mines ($1$ to $24$).
* Dynamic risk/reward probability math and accumulated multipliers.
* Sound, particle effects, and live cashout.

### 3. 🛡️ Provably Fair Engine
* Cryptographic HMAC-SHA256 based on `serverSeed + clientSeed:nonce`.
* Public pre-round SHA-256 hash display.
* Integrated verification calculator for complete transparency.

### 4. 💳 Cashier & Wallet Desk
* **EasyPaisa / JazzCash / Bank Transfer**: Receipt TID submission.
* **Crypto (USDT TRC-20)**: Address display and transaction hash submission.
* Deposit, withdrawal request, and transaction history tracking.

### 5. 👑 Super Admin Back Office
* Live Financial Metrics: Total Wagered, Total Payouts, Gross Gaming Revenue (GGR).
* **House Edge & RTP Slider**: Configure house edge ($1\%$ to $15\%$, default $4\% = 96\%$ RTP) with immediate effect.
* Cashier Approval Desk: 1-click **Approve** (instantly credits balance) or **Reject**.
* Player Account Management: Balance manual adjustment and account suspension.

---

## 🚀 How to Run the Platform

### Option 1: Run Full Platform (Frontend + Backend on Port 5000)
```powershell
cd C:\Users\Win10\.gemini\antigravity\scratch\win-platform
npm start
```
Then open your browser at:
👉 **`http://localhost:5000`**

### Option 2: Development Mode (Hot Reload)
In Terminal 1 (Backend):
```powershell
cd C:\Users\Win10\.gemini\antigravity\scratch\win-platform\server
node index.js
```
In Terminal 2 (Frontend Vite Dev):
```powershell
cd C:\Users\Win10\.gemini\antigravity\scratch\win-platform\client
npm run dev
```
Then open:
👉 **`http://localhost:3000`**

---

## 🔑 Default Accounts (1-Click Login Ready)

| Role | Username | Password | Initial Balance | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | `admin` | `admin123` | PKR 100,000 | Full Back Office, Cashier approvals, RTP slider |
| **Demo Player** | `LuckyPlayer` | `user123` | PKR 2,500 | Playing games, depositing, withdrawing |
| **New Register** | *(Any username)* | *(Any)* | PKR 1,500 | Automatic welcome bonus credited |
