const originServer = ''
const crossOriginServer = 'http://localhost:8081'
const actualOrigin = document.location.origin

testAll()

async function testAll() {
    const titleOrigin = `Testing origin server - origin: ${actualOrigin}, target: ${originServer}`
    console.log(titleOrigin)
    console.log('-'.repeat(titleOrigin.length))
    await testRegular(originServer)
    console.log('\n')
    await testCors(originServer)
    console.log('\n')

    const titleCrossOrigin = `Testing cross-origin server - origin: ${actualOrigin}, target ${crossOriginServer}`
    console.log(titleCrossOrigin)
    console.log('-'.repeat(titleCrossOrigin.length))
    try {
        await testRegular(crossOriginServer)
    } catch(e) {
        console.log('Expected error occurred trying to make a cross-origin request ' +
        'to a non CORS-enabled endpoint:')
    }
    console.log('\n')
    await testRegularModeNonCors(crossOriginServer)
    console.log('\n')
    await testCors(crossOriginServer)
}

async function testRegular(server) {
    const url = `${server}/regular-endpoint`
    console.log(`Testing regular endpoint: ${url}`)
    await testAndLogRequest(url)
}

async function testRegularModeNonCors(server) {
    const url = `${server}/regular-endpoint`
    console.log(`Testing regular endpoint with mode: 'no-cors': ${url}`)
    await testAndLogRequest(url, { mode: 'no-cors' }, false)
    console.log('mode: non-cors does not provide a response body')
    // Shouldn't this fail as Content-Type: application/json isn't a CORS safelisted header?
    // Is it because it doesn't include Content-Type in the request, even though the
    // response is Content-Type: application/json?
}

async function testCors(server) {
    const url = `${server}/cors-enabled-endpoint`
    console.log(`Testing CORS-enabled endpoint: ${url}`)
    await testAndLogRequest(url)
}

async function testAndLogRequest(url, requestOptions, readBody = true) {
    const request = new Request(url, requestOptions)
    const response = await fetch(request)
    console.log(`request.headers.mode: ` + request.mode)
    console.log(`request.headers.credentials: ` + request.credentials)
    console.log(`response.type: ` + response.type)
    console.log(`response.body: ` + response.body)
    if(readBody) console.log(`response.json(): ` + JSON.stringify(await response.json()))
}

/*
Maybe unit test a bit?

To cover:
- Simple requests - i.e. no preflight
- Preflight requests
    - Do a few e.gs, request method, custom request header, application/json content-type
- Test where a non-simple request breaks mode: no-cors

Credentials
-----------
- Requests where Access-Control-Allow-Credentials: true is included
- Requests where credentials: 'include' is set
- Requests with just the header and no credentials: 'include'. I think this will send the request but
then make the response not available to see.
 */