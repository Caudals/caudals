import { describe, expect, it } from "vitest";
import { checkSignupEmail, DISPOSABLE_DOMAINS, FREE_MAIL_DOMAINS } from "./signup-domains";

describe("checkSignupEmail (launch L-05 blocklist)", () => {
  it("accepts work addresses and reports the registrable domain", () => {
    expect(checkSignupEmail("  Ana.Perez@Acme-Seguros.es ", {})).toEqual({
      email: "ana.perez@acme-seguros.es", host: "acme-seguros.es", domain: "acme-seguros.es", kind: "work", exception: false,
    });
    expect(checkSignupEmail("ana@mail.acme.co.uk", {})).toMatchObject({ host: "mail.acme.co.uk", domain: "acme.co.uk", kind: "work" });
    expect(checkSignupEmail("ana@ventas.empresa.com.es", {})).toMatchObject({ domain: "empresa.com.es", kind: "work" });
    // Microsoft 365 default tenants are separate companies.
    expect(checkSignupEmail("ana@contoso.onmicrosoft.com", {})).toMatchObject({ domain: "contoso.onmicrosoft.com", kind: "work" });
    expect(checkSignupEmail("ana@contoso.mail.onmicrosoft.com", {})).toMatchObject({ domain: "contoso.mail.onmicrosoft.com" });
    expect(checkSignupEmail("ana@fabrikam.onmicrosoft.com", {}).domain).not.toBe(checkSignupEmail("ana@contoso.onmicrosoft.com", {}).domain);
  });

  it("refuses personal free-mail providers, including their subdomains and country variants", () => {
    for (const email of ["someone@gmail.com", "someone@hotmail.es", "someone@outlook.com", "someone@yahoo.com.mx", "someone@proton.me", "someone@telefonica.net", "someone@icloud.com"]) {
      expect(checkSignupEmail(email, {}).kind, email).toBe("free_mail");
    }
    expect(checkSignupEmail("someone@eu.gmx.com", {}).kind).toBe("free_mail");
  });

  it("refuses disposable inboxes, and extra domains ops add at runtime", () => {
    expect(checkSignupEmail("x@mailinator.com", {}).kind).toBe("disposable");
    expect(checkSignupEmail("x@yopmail.fr", {}).kind).toBe("disposable");
    expect(checkSignupEmail("x@new-burner.io", {}).kind).toBe("work");
    expect(checkSignupEmail("x@new-burner.io", { SELF_SERVE_SIGNUP_BLOCKED_DOMAINS: " New-Burner.io ,other.example" }).kind).toBe("disposable");
  });

  it("treats malformed and reserved addresses as invalid", () => {
    for (const email of ["", "ana", "ana@", "@acme.es", "ana@acme", "ana@acme.es@evil.es", "ana@-acme.es", "ana @acme.es", "ana@acme.test", "ana@acme.example", "ana@example.com", "ana@sub.example.org", "ana@localhost", "ana@acme.123", `${"a".repeat(250)}@acme.es`]) {
      expect(checkSignupEmail(email, {}).kind, email).toBe("invalid");
    }
  });

  it("lets the ops exception list through by exact address or domain, and lifts the domain rule", () => {
    const env = { SELF_SERVE_SIGNUP_EXCEPTIONS: "Founder@Gmail.com, partner-agency.es, none" };
    expect(checkSignupEmail("founder@gmail.com", env)).toMatchObject({ kind: "work", exception: true, domain: "gmail.com" });
    expect(checkSignupEmail("other@gmail.com", env)).toMatchObject({ kind: "free_mail", exception: false });
    expect(checkSignupEmail("ana@team.partner-agency.es", env)).toMatchObject({ kind: "work", exception: true, domain: "partner-agency.es" });
    // An exception never turns an address that cannot receive mail into a valid one.
    expect(checkSignupEmail("ana@acme.test", { SELF_SERVE_SIGNUP_EXCEPTIONS: "acme.test" }).kind).toBe("invalid");
    // `none` (the credentials script refuses empty values) matches nothing.
    expect(checkSignupEmail("ana@none", env).kind).toBe("invalid");
  });

  it("keeps the two lists disjoint and lower-case", () => {
    for (const domain of [...FREE_MAIL_DOMAINS, ...DISPOSABLE_DOMAINS]) expect(domain).toBe(domain.toLowerCase());
    expect([...FREE_MAIL_DOMAINS].filter((domain) => DISPOSABLE_DOMAINS.has(domain))).toEqual([]);
  });
});
