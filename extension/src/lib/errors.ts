import axios from "axios";

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError<{ error?: string }>(err) && err.response?.data?.error) {
    return err.response.data.error;
  }
  return "Something went wrong. Please try again.";
}
