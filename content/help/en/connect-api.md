---
title: Connect an API
summary: Test an assistant through an OpenAI-compatible HTTPS endpoint, with an optional key that Caudals stores encrypted and never shows again.
keywords: [api, endpoint, openai, compatible, chat completions, https, api key, token, bearer, header, credentials, private network, runner]
related: [connect-website-chat, data-and-privacy, prepare-and-run]
owner: engineering
reviewed: 2026-10-12
review_by: 2027-01-12
---

If your assistant has an API that accepts chat requests in the OpenAI format, Caudals can send it each question directly.

## Add the API {#add}

1. Go to **Evaluations** and choose **New evaluation**.
2. Under **How should Caudals reach it?**, choose **API**.
3. Fill in the three fields below, then choose **Create evaluation**.

- **HTTPS API endpoint**: the full address that receives chat requests. For most providers it ends in `/chat/completions`, for example `https://api.example.com/v1/chat/completions`.
- **Model or deployment name**: the value Caudals sends as `model`.
- **API key (optional)**: sent as a bearer token.

The address must be public and use HTTPS. Caudals checks that before saving it.

## What Caudals sends {#requests}

For each question Caudals sends one `POST` request with a JSON body containing `model`, `messages` (your question as the user message) and `"stream": false`, and reads the reply from `choices[0].message.content`.

- One request at a time, about six a minute.
- Each request waits up to two minutes for an answer.
- Calls to your API are billed by your own provider, not by Caudals.

## Keys and other headers {#credentials}

To use a header other than `Authorization`, or to change a key, open the system under **Systems** and go to **Credentials**. Give the credential a label, the header name and the key or token.

Values are write-only. Caudals encrypts them, never shows them again and uses them only when calling this system. Saving or rotating a key creates a new version of the system, so earlier results stay tied to the version they used.

## If your system is not on the internet {#private}

For a system inside your own network, Caudals has a private runner: a command-line tool you run inside your network that fetches the questions and sends back the answers, with outbound connections only. It is enabled per workspace by Caudals and is not part of the free plan. [Ask us](help:getting-help) if you need it.

Other API formats are not available yet. If your assistant cannot answer in the OpenAI format, you can still evaluate it by [uploading its answers](help:uploads#answers), where that option is enabled.
