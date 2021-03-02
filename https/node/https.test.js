const https = require('https')

test('https', async () => {
    expect.hasAssertions() // Make sure we wait for async assertions.

    // Boot HTTPS server.
    const {server, serverListening} = require('./https-server')
    await serverListening

    // Make HTTPS request to server.
    await new Promise(resolve => {
        https.get('https://localhost:8080', {rejectUnauthorized: false}, resp => {
            let data = '';
            resp.on('data', (chunk) => data += chunk)
            resp.on('end', () => {
                expect(data).toBe('HTTPS response')
                resolve()
            })
        })
    })

    // Shut server down.
    await new Promise(resolve => server.close(resolve))
})