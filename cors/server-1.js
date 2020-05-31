const express = require('express')

const app = require('./create-server')(8080)

/* Server 1 serves HTML and JS which will make requests to:
 - Server 1 - it's origin
 - Server 2 - cross-origin
 */
app.use(express.static('public'))