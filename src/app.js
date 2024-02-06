const express = require("express");
const interRoutes = require("./routes/interRoutes");
const app = express();
app.use(express.json());
const cors = require("cors");
app.use(cors());

app.use(express.json());
app.use("/inter", interRoutes);

module.exports = app;
