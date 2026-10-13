---
title: Connect a website chat
summary: Point Caudals at the page where your chat opens, then check the connection in a live browser if the automatic check needs help.
keywords: [website, chat, chatbot, widget, connect, connection, live browser, login, sign in, captcha, repair]
related: [connect-api, prepare-and-run, data-and-privacy]
owner: operations
reviewed: 2026-10-12
review_by: 2027-01-12
---

Caudals can ask your questions through the same chat window your customers use, on your public website or behind a login.

## Add the chat {#add}

1. Go to **Evaluations** and choose **New evaluation**.
2. Under **How should Caudals reach it?**, choose **Website chatbot**.
3. Enter the **Website URL** of a page where the chat opens. Use an `https://` address.
4. Choose **Create evaluation**.

Caudals then checks the connection on its own: it opens the page in a fresh browser, finds the chat box, sends a test message and reads the reply. While it works, the system shows **Checking connection**.

## When the check needs you {#live-browser}

Some chats need a click to open, a sign-in or a CAPTCHA. The system then shows **Needs assistance**, and a workspace owner can fix it:

1. Open the evaluation's **Connect** step (or the system under **Systems**) and choose **Open live browser**.
2. You are in control of that browser. Sign in, complete any single sign-on, two-factor step or CAPTCHA, and open the chat if it needs a click. Caudals never gets around a CAPTCHA by itself.
3. Choose **Connect system**. Caudals finds the chat box, sends a test message, reads the reply, reloads the page and repeats the test in fresh sessions.
4. If one element is not found, use **Fix** next to it in **What Caudals uses** (message box, send button, reply and so on), then **Test again**.

When the test passes you see **Connected**. A login you used is saved encrypted and stays until you revoke it. Caudals never receives your password.

The live browser closes after 20 minutes without activity or two hours in total. Your saved connection is kept, and you can open it again at any time.

## During a run {#during-run}

Caudals asks one question at a time, about six a minute, and waits for the complete reply, so that it never floods your chat.

If your site changes, the login expires or the site hits a usage limit, the run pauses instead of recording wrong answers. Repair the connection with **Repair connection**, then resume the run, finish it with the answers captured so far, or start a new one. See [Prepare and run your tests](help:prepare-and-run#run).

## Good to know {#notes}

- Only owners can open the live browser. Editors can run evaluations once the chat is connected.
- Caudals sends only the ordinary questions in your test set. It never runs adversarial tests without your written authorisation.
- Screenshots taken when a check fails are kept for seven days.
