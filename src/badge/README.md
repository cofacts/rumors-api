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

## Sending request via Swagger UI

You can send test requests in this Swagger UI in the browser using your current login session.

However, since different APIs are managed by different Cloudflare Access Applications, your current
login session may not yet be authorized to the API you want to call. In this case, you may see your
request sent in Swagger UI being redirected to Cloudflare, and is then blocked by the browser.

To authorize your current login session to an API, try visiting the API path directly.
For example, in order to call `/moderation/awardBadge`, you can first [visit `/moderation`](/moderation) directly in your browser.
Cloudflare will do the authorization and redirect you to the 404 page.
By that time your login session cookie should have been updated, and you can then call 
`/moderation/awardBadge` in `/docs`'s Swagger UI.
