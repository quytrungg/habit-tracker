import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthForm } from "@/components/auth/auth-form";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  push.mockReset();
  refresh.mockReset();
});

describe("AuthForm", () => {
  it("registers a new account and enters the tracker", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ user: { id: "user-1" } })));
    const user = userEvent.setup();
    render(<AuthForm mode="register" />);

    await user.type(screen.getByLabelText("Name"), "Mai");
    await user.type(screen.getByLabelText("Email"), "mai@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({ method: "POST" }),
    );
    expect(push).toHaveBeenCalledWith("/habits");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the server error without losing the form", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "Email or password is incorrect" } }),
        { status: 401 },
      ),
    );
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);

    await user.type(screen.getByLabelText("Email"), "mai@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Email or password is incorrect"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("mai@example.com")).toBeInTheDocument();
  });
});
