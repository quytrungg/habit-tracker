"use client";

import { Flame, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

type AuthFormValues = {
  displayName: string;
  email: string;
  password: string;
};

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormValues>({
    defaultValues: { displayName: "", email: "", password: "" },
  });
  const isRegister = mode === "register";

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    const payload = isRegister
      ? {
          ...values,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        }
      : { email: values.email, password: values.password };
    try {
      const response = await fetch(`/api/auth/${isRegister ? "register" : "login"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        setServerError(result.error?.message ?? "Unable to continue");
        return;
      }
      router.push("/habits");
      router.refresh();
    } catch {
      setServerError("The server could not be reached. Try again.");
    }
  });

  return (
    <div className="auth-card">
      <div className="auth-mark" aria-hidden="true">
        <Flame size={28} fill="currentColor" />
      </div>
      <p className="eyebrow">EMBER HABITS</p>
      <h1>{isRegister ? "Begin a new rhythm" : "Welcome back"}</h1>
      <p className="auth-intro">
        {isRegister
          ? "A calmer way to make progress visible, one day at a time."
          : "Your habits, notes, and rewards are waiting."}
      </p>

      <form className="form-stack" onSubmit={submit} noValidate>
        {isRegister ? (
          <label className="field">
            <span>Name</span>
            <input
              autoComplete="name"
              {...register("displayName", {
                required: "Enter your name",
                maxLength: { value: 80, message: "Use 80 characters or fewer" },
              })}
            />
            {errors.displayName ? (
              <small role="alert">{errors.displayName.message}</small>
            ) : null}
          </label>
        ) : null}

        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            inputMode="email"
            type="email"
            {...register("email", {
              required: "Enter your email",
              pattern: { value: /^\S+@\S+\.\S+$/, message: "Enter a valid email" },
            })}
          />
          {errors.email ? <small role="alert">{errors.email.message}</small> : null}
        </label>

        <label className="field">
          <span>Password</span>
          <input
            autoComplete={isRegister ? "new-password" : "current-password"}
            type="password"
            {...register("password", {
              required: "Enter your password",
              minLength: isRegister
                ? { value: 8, message: "Use at least 8 characters" }
                : undefined,
            })}
          />
          {errors.password ? (
            <small role="alert">{errors.password.message}</small>
          ) : null}
        </label>

        {serverError ? (
          <p className="form-error" role="alert">
            {serverError}
          </p>
        ) : null}

        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? <LoaderCircle className="spin" size={19} /> : null}
          {isRegister ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="auth-switch">
        {isRegister ? "Already tracking?" : "New to Ember?"}{" "}
        <Link href={isRegister ? "/login" : "/register"}>
          {isRegister ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
