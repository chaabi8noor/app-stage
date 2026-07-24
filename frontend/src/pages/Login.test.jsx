import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { api } from "../api/client";
import Login from "./Login";

vi.mock("../api/client", () => ({
  api: { login: vi.fn() },
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("Login", () => {
  beforeEach(() => {
    localStorage.clear();
    api.login.mockReset();
  });

  it("stores the authenticated user after a successful login", async () => {
    api.login.mockResolvedValue({
      access_token: "test-access-token",
      user: { id: 1, name: "Admin", role: "admin" },
    });
    renderLogin();

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "admin@intern.app" } });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "secure-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith("admin@intern.app", "secure-password"));
    expect(localStorage.getItem("token")).toBe("test-access-token");
    expect(JSON.parse(localStorage.getItem("user"))).toMatchObject({ id: 1, role: "admin" });
  });

  it("shows the API error when login fails", async () => {
    api.login.mockRejectedValue(new Error("Identifiants invalides"));
    renderLogin();

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "admin@intern.app" } });
    fireEvent.change(screen.getByPlaceholderText("Mot de passe"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Identifiants invalides")).toBeInTheDocument();
  });
});
