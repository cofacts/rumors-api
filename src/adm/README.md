# Cofacts Admin API

Welcome! You have been granted access to this API by the Cofacts Work Group.

To access the API programmatically, you need to use [Service Tokens](https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/#connect-your-service-to-access).
Please contact Cofacts Work Group to get your `CLIENT_ID` and `CLIENT_SECRET`.

Here are some examples with `curl` command (`<current host>` denotes the host name of this document page, i.e. URL without "/docs".):
```sh
# Get OpenAPI schema via curl command
curl -H "CF-Access-Client-Id: <CLIENT_ID>" -H "CF-Access-Client-Secret: <CLIENT_SECRET>" <current host>/openapi.json

# Call POST /ping and get pong + echo
curl -XPOST -H "CF-Access-Client-Id: <CLIENT_ID>" -H "CF-Access-Client-Secret: <CLIENT_SECRET>" -d '{"echo": "foo"}' <current host>/ping
```

The response would attach a cookie named `CF_Authorization` that you may use for [subsequent requests](https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/#subsequent-requests).
