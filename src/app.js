const express = require("express");
const cors = require("cors");

const app = express();

app.use((req, res, next) => {
    console.log("Request URL:", req.originalUrl);
    next();
});

const interRoutes = require("./routes/interRoutes");

app.use(express.json());
app.use(cors());
app.use("/public", express.static("/var/api-inter/public"));
app.use("/inter", interRoutes);

module.exports = app;
