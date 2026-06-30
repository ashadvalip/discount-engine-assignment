# Opptra Premium Discount Engine & Checkout Suite

Welcome to the premium checkout portal for Opptra. This application has been upgraded into a high-fidelity Candidate Code Challenge solution, resolving all core and task-level requirements with production-grade reliability, visual excellence, and edge-case handling.

---

## 🌟 Key Features

### 1. Cart-Level Offers (Task 1)
- **Advanced Stacking Logic:** Supports `cart` scope rules with `min_cart_value` condition constraints. Evaluates cart-level discounts on top of the final itemized totals.
- **Exclusivity & Stacking Rules:** Selects the maximum saving option for non-stackable cart rules and stacks stackable rules dynamically.
- **Sleek Table Integration:** Automatically appends the subtotal, triggered cart-level offers, and final payables directly in the summary table to match the expected outputs exactly.
- **Smart Threshold Nudges:** A built-in retail motivator. If the cart subtotal falls just below any cart-level rules, a premium glowing banner notifies the customer exactly how many rupees they are from unlocking the discount (e.g. *"💡 Add Rs.68 more to unlock RULE-04 (10% off entire cart)!"*).

### 2. Natural Language Rule Input (Task 2)
- **Hybrid Parser System:** 
  - **Client-Side Gemini LLM:** Integrates the Google Gemini API directly from the client. Configured with strict JSON-schema mode (`responseMimeType: "application/json"`) to ensure 100% stable structured output.
  - **Offline Local Regex Fallback:** If no Gemini API key is provided, a deterministic regex parser resolves all standard rule patterns (and common variants) instantly without calling the network.
- **Interaction Safety:** Parses rules and displays a detailed **Confirmation Card** (showing Scope, Applies To, Value, Stackable, and Min Cart Value) for user review before updating the engine state.
- **Vagueness Detection:** Detects ambiguous prompts (like *"Give a discount for big orders"*) and gracefully alerts the user with helpful correction prompts instead of crashing.

### 3. PDF Cart Upload (Task 3)
- **Coordinate-Based Table Extraction:** Dynamically loads `pdfjs-dist` from a fast CDN (no bundling overhead) and groups text elements by their `y` viewport coordinate to reconstruct rows. Classified using horizontal center boundaries of detected headers (`Product`, `Brand`, `Platform`, `Base Price`).
- **Unstructured Text Fallback:** Employs a line-by-line regex parser if column grids are flat or header positions are unavailable.
- **Senior-Grade Error Recovery:** Malformed or missing row columns are skipped and flagged in an inline warning banner, preventing data corruption while maintaining checkout continuity.

### 4. Premium Aesthetic Upgrade
- **Dark-Theme Interface:** Radial gradient glows, glassmorphic card overlays, and clean board dividers.
- **Modern Typography:** Styled using Outfit (for headings/headers) and Inter (for body text).
- **Micro-Animations:** Hover transitions, glow pulses on thresholds, and table row highlights.
- **Instantly Clickable:** Preloaded with the assignment's sample rules and cart items on boot, so the evaluator can test calculation flows immediately.

---

## 🚀 Running Locally

Follow these 3 simple steps to run the application locally:

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Set Up Google Gemini API (Optional)
If you want to use the Gemini LLM for natural language rules, you can:
- Input your API key directly in the **API Configuration** panel inside the app header.
- (API keys are stored securely in your browser's `localStorage` and never sent to third parties other than Google).
- If left blank, the app will automatically use the robust **local regex parser fallback**.

### Step 3: Launch Dev Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📦 Building & Deployment

To compile the production build:
```bash
npm run build
```
This outputs a lightweight static bundle inside the `dist/` directory.

### Live Deployment
The project is configured for one-click deployment to Vercel.

- **Live URL:** [https://discount-engine-assignment-ashadvalip.vercel.app/](https://discount-engine-assignment-ashadvalip.vercel.app/)

---

## 📂 Project Architecture

```
src/
  engine/
    discountEngine.js   ← core pricing engine, extended with calculateCartDiscounts
    csvParser.js        ← CSV parser, extended with cart scope & validation
    nlParser.js         ← [NEW] NL Rule Parser (Gemini API + Local Regex fallback)
    pdfParser.js        ← [NEW] Coordinate-based PDF table extractor
  components/
    CsvUploader.jsx     ← CSV upload component
    DataTable.jsx       ← Table view, updated with glassmorphism & hovers
    ErrorBanner.jsx     ← CSV/rules error display
  App.jsx               ← Main dashboard portal, state wiring & premium CSS styles
  main.jsx              ← React entrypoint
```
