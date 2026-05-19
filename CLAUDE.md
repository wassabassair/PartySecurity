# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PartySecurity is a party entrance verification system. People who pay receive a Data Matrix (2D barcode) image containing a unique UUID via a messaging app. At the entrance, a bouncer scans the Data Matrix; the system marks it as used in the database so the code cannot be reused or shared.

**No app install required for attendees** — they only need a messaging app to receive the barcode image.

## Core Domain Concepts

- **UUID**: A unique identifier generated per ticket/payment, stored in the database.
- **isUsed**: A boolean flag on each UUID record. Set to `true` on first scan; subsequent scans are rejected.
- **Data Matrix**: A 2D barcode format encoding the UUID, sent as an image to the ticket holder.
- **Scan flow**: Bouncer scans Data Matrix → backend validates UUID exists and `isUsed === false` → marks `isUsed = true` → grants or denies entry.
