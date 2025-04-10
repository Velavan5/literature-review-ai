// server.js
const express = require("express");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure FLASK_API_URL ends WITHOUT '/search' as we append it later
// Default assumes Flask's search endpoint is at '/search' relative to its base URL
const FLASK_BASE_URL = process.env.FLASK_BASE_URL || "http://localhost:5000";
const FLASK_SEARCH_ENDPOINT = "/search"; // The specific endpoint path

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Routes ---
app.get("/", (req, res) => {
  console.log(`[${new Date().toISOString()}] GET / - Serving UI`);
  res.sendFile(path.join(__dirname, "views", "ui.html"));
});

// Handle the search request from the frontend
app.post("/search", async (req, res) => {
  // **UPDATED**: Extract requirePdf along with query and limit
  const { query, limit, requirePdf } = req.body;
  const requestTimestamp = new Date().toISOString();
  console.log(
    `[${requestTimestamp}] POST /search - Received query: "${query}", limit: ${
      limit || "default"
    }, requirePdf: ${requirePdf}`
  );

  if (!query) {
    console.log(`[${requestTimestamp}] POST /search - Error: Query is missing`);
    return res.status(400).json({ error: "Query parameter is required." });
  }

  // Validate limit client-side is preferred, but add basic server check
  const validatedLimit = parseInt(limit, 10) || 15; // Use provided limit or default
  if (validatedLimit <= 0 || validatedLimit > 100) {
    console.log(
      `[${requestTimestamp}] POST /search - Error: Invalid limit value ${limit}`
    );
    return res.status(400).json({ error: "Limit must be between 1 and 100." });
  }

  try {
    // **UPDATED**: Construct the target URL dynamically
    let targetUrl = FLASK_BASE_URL + FLASK_SEARCH_ENDPOINT; // Start with base search URL
    if (requirePdf === true) {
      targetUrl += "?require_pdf=true"; // Append query parameter if true
      console.log(
        `[${requestTimestamp}] POST /search - Appending ?require_pdf=true to Flask URL`
      );
    }

    console.log(
      `[${requestTimestamp}] POST /search - Forwarding request to Flask API: ${targetUrl}`
    );

    // **UPDATED**: Send POST request to the potentially modified targetUrl
    // The BODY sent to Flask ONLY contains query and limit, as requirePdf is now a URL param
    const flaskResponse = await axios.post(
      targetUrl,
      {
        query: query,
        limit: validatedLimit, // Send the validated limit
      },
      {
        timeout: 45000, // Keep timeout
      }
    );

    console.log(
      `[${requestTimestamp}] POST /search - Received successful response from Flask API (Status: ${flaskResponse.status})`
    );
    res.status(flaskResponse.status).json(flaskResponse.data);
  } catch (error) {
    // --- Error Handling (Keep As Is) ---
    console.error(
      `[${requestTimestamp}] POST /search - Error during Flask API call:`,
      error.message
    );
    if (error.response) {
      console.error(
        `[${requestTimestamp}] POST /search - Flask API Error Status:`,
        error.response.status
      );
      console.error(
        `[${requestTimestamp}] POST /search - Flask API Error Data:`,
        error.response.data
      );
      res
        .status(error.response.status)
        .json({
          error:
            error.response.data?.error ||
            `Flask API error (${error.response.status})`,
        }); // Safer access to error message
    } else if (error.request) {
      console.error(
        `[${requestTimestamp}] POST /search - No response received from Flask API:`,
        error.request
      );
      res
        .status(502)
        .json({ error: "Could not connect to the search service." });
    } else if (error.code === "ECONNABORTED") {
      console.error(
        `[${requestTimestamp}] POST /search - Request to Flask API timed out.`
      );
      res
        .status(504)
        .json({ error: "The request to the search service timed out." });
    } else {
      console.error(
        `[${requestTimestamp}] POST /search - Axios setup error:`,
        error.message
      );
      res.status(500).json({ error: "An internal server error occurred." });
    }
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(
    `[${new Date().toISOString()}] Express server started successfully.`
  );
  console.log(`Flask API Base URL configured as: ${FLASK_BASE_URL}`);
  console.log(`Frontend accessible at http://localhost:${PORT}`);
});