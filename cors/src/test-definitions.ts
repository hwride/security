module.exports = [
    {
        name: 'Origin: same<br/>CORS aware: <span class="error">no</span>',
        notes: `This is just a regular request.`,
        url: '${server1}/regular-endpoint',
        requestOptions: { mode: 'same-origin' },
    },
    {
        name: 'Origin: same<br/>CORS aware: <span class="success">yes</span><br/>Allowed origins: <span class="error">none</span>',
        notes: `This shows even with CORS disabled the same origin can still use the endpoint.`,
        url: '${server1}/cors-disabled-endpoint',
        requestOptions: { mode: 'same-origin' },
    },
    {
        name: 'Origin: cross<br/>CORS aware: <span class="error">no</span>',
        notes: `The CORS protocol is designed to work without any changes to existing server implementations. This
means a request to an endpoint with no CORS knowledge will be sent and processed, but the response won't be exposed
to the client.`,
        url: '${server2}/regular-endpoint',
        expectNoResponseBody: true
    },
    {
        name: 'Origin: cross<br/>CORS aware: <span class="error">no</span><br/><code>mode: \'no-cors\'</code>',
        url: '${server2}/regular-endpoint',
        requestOptions: { mode: 'no-cors' },
        notes: `When <code>mode: no-cors</code> is enabled cross-origin requests can be made if using a simple
request. But note the response is opaque - nothing is readable by the script.`
    },
    {
        name: 'Origin: cross<br/>CORS aware: <span class="success">yes</span><br/>Allowed origins: <span class="error">none</span>',
        notes: `A cross-origin request denied due to server configuration.`,
        url: '${server2}/cors-disabled-endpoint',
        expectNoResponseBody: true
    },
    {
        name: 'Origin: cross<br/>CORS aware: <span class="success">yes</span><br/>Allowed origins: <span class="success">all</span>',
        notes: `A cross-origin request allowed due to server configuration.`,
        url: '${server2}/cors-all-allowed-endpoint'
    },
    {
        name: `Origin: cross<br/>
CORS aware: <span class="success">yes</span><br/>
Allowed origins: <span class="success">all</span><br/>
<code>method: 'POST'</code>`,
        notes: `A <code>POST</code> counts as a simple request.`,
        requestOptions: { method: 'POST' },
        url: '${server2}/cors-all-allowed-endpoint'
    },
    {
        name: `Origin: cross<br/>
CORS aware: <span class="success">yes</span><br/>
Allowed origins: <span class="success">all</span><br/>
<code>method: 'PUT'</code>`,
        notes: `Non simple requests require a pre-flight (<code>OPTIONS</code>) request - <code>method</code>.`,
        requestOptions: { method: 'PUT' },
        url: '${server2}/cors-all-allowed-endpoint'
    },
    {
        name: `Origin: cross<br/>
CORS aware: <span class="success">yes</span><br/>
Allowed origins: <span class="success">all</span><br/>
Custom headers`,
        notes: `Non simple requests require a pre-flight (<code>OPTIONS</code>) request - custom headers.`,
        requestOptions: {
            headers: {
                'X-Custom-Header': 'Custom header value'
            }
        },
        url: '${server2}/cors-all-allowed-endpoint'
    },
    {
        name: `Origin: cross<br/>
CORS aware: <span class="success">yes</span><br/>
Allowed origins: <span class="success">all</span><br/>
<code>Content-Type: application/json</code>`,
        notes: `Non simple requests require a pre-flight (<code>OPTIONS</code>) request - non-safe
<code>Content-Type</code>.`,
        requestOptions: {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: '{ "json-body": true }'
        },
        url: '${server2}/cors-all-allowed-endpoint'
    },
    {
        name: `Origin: cross<br/>
CORS aware: <span class="success">yes</span><br/>
Allowed origins: <span class="success">all</span><br/>
<code>mode: 'no-cors'</code><br/>
<code>method: 'PUT'</code>`,
        notes: `Non simple requests cannot be made with <code>mode: no-cors</code>.`,
        requestOptions: {
            method: 'PUT',
            mode: 'no-cors'
        },
        url: '${server2}/cors-all-allowed-endpoint',
        expectNoResponseBody: true,
        expectBlockedRequest: true
    },
    {
        name: `Origin: cross<br/>CORS aware: <span class="success">yes</span><br/>
Allowed origins: <span class="success">all</span><br/>
<code>mode: 'same-origin'</code>`,
        notes: `If you try and make a cross-origin request with <code>mode: 'same-origin'</code> it will fail before
the request is even sent, even for a endpoint that would support cross-origin requests for that origin.`,
        url: '${server2}/cors-all-allowed-endpoint',
        requestOptions: { mode: 'same-origin' },
        expectNoResponseBody: true,
        expectBlockedRequest: true
    }
]