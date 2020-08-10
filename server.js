const express = require("express");
const axios = require("axios");
const redis = require("redis");

const dotenv = require("dotenv");
dotenv.config();

const app = express();

// setup redis client

const client = redis.createClient(
  process.env.REDIS_PORT,
  process.env.REDIS_HOST, {
  auth_pass: process.env.REDIS_PASSWORD,
  tls: { servername: process.env.REDIS_HOST },
}
);

// redis store configs
const employeeRedisKey = "store:employees"; // cahce key for employeees
const dataExpireTime = 3600; // 1 hour cache expire time

// main endpoint
app.get("/", (req, res) =>
  res.send("Welcome to Node.js + redis boilerplate API.")
);

// employee endpoint with caching
app.get("/employees", (req, res) => {
  // try to fetch the result from redis
  return client.get(employeeRedisKey, (err, employees) => {
    if (employees) {
      return res.json({ source: "cache", data: JSON.parse(employees) });

      // if cache not available call API
    } else {
      // get data from remote API
      axios
        .get("https://employee-main.azurewebsites.net/employees")
        .then((res) => res.data)
        .then((users) => {
          // save the API response in redis store
          client.setex(employeeRedisKey, 3600, JSON.stringify(users));

          // send JSON response to client
          return res.json({ source: "api", data: users });
        })
        .catch((error) => {
          // send error to the client
          return res.json(error.toString());
        });
    }
  });
});

// user details endpoint
app.get("/", (req, res) =>
  res.send("Welcome to Node.js + Redis boilerplate API.")
);

// start express server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server listening on port:", PORT);
});
