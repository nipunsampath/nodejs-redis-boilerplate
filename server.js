const express = require("express");
const axios = require("axios");
const redis = require("redis");
const cors = require('cors');
const dotenv = require("dotenv");
const fileUpload = require('express-fileupload');
dotenv.config();

const app = express();
app.use(fileUpload());
app.use(cors());

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
const dataExpireTime = process.env.CACHE_PERIOD; // 1 hour cache expire time

// main endpoint
app.get("/", (req, res) =>
  res.send("Welcome to Node.js + redis boilerplate API.")
);

// get employee endpoint with caching
app.get("/employees", (req, res) => {
  return client.get(employeeRedisKey, (err, employees) => {
    if (!err) {
      if (employees) {
        // try to fetch the result from redis
        return res.json({ source: "cache", data: JSON.parse(employees) });
      } else {
        // get data from remote API
        axios.get(process.env.GET_EMPLOYEE_ENDPOINT)
          .then((res) => res.data)
          .then((employees) => {
            // save the API response in redis store
            client.setex(employeeRedisKey, dataExpireTime, JSON.stringify(employees));

            // send JSON response to client
            return res.json({ source: "api", data: employees });
          })
          .catch((error) => {
            // send error to the client
            return res.json(error.toString());
          });
      }
    }
    else {
      console.log(err.toString());
    }

  });
});

// save user endpoint
app.post("/saveEmployee", async (req, res) => {
  console.log("request recieved");

  let nic = req.files.nic;
  let dbInsertionStatus = null;
  let newEmployee = null;

  const employeeData = {
    'fname': req.body.fname,
    'lname': req.body.lname,
    'dob': req.body.dob,
    'empType': req.body.empType,
    'address': req.body.address
  }
  const properties = { headers: { "Content-Type": "application/json" } };

  await axios.post(process.env.SAVE_EMPLOYEE_ENDPOINT, employeeData, properties)
    .then((result) => {
      dbInsertionStatus = result.status;
      newEmployee = result.data;
      console.log(newEmployee);
    })
    .catch((error) => {
      dbInsertionStatus = error.status;
    });

    console.log("Uploading nic to azure blob storage");

  axios.post("https://handle-nic-upload.azurewebsites.net/api/uploadFile", {
    filedata: nic.data,
    filename: newEmployee.id,
  }).then((result) => {

    if (result.status === 200 && dbInsertionStatus === 200) {
      res.status(200).json({ "message": "Employee saved successfully!" });
    }
    else if (dbInsertionStatus === 200) {
      res.status(207).json({ "message": "NIC upload failed!" });
    }
    else if (result.status === 200) {
      res.status(207).json({ "message": "DB insertion failed!" });
    }
    else
      res.sendStatus(500);
    console.log("response sent");
  }).catch((error) => {
    // send error to the client

    console.log(error);
    return res.json(error.toString());

  });

});




// start express server
const PORT = process.env.PORT || 6000;
app.listen(PORT, () => {
  console.log("Server listening on port:", PORT);
});
