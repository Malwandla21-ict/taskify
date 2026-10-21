/* The single source for the video: the five test cases (as they appear in
   the test-case table) and every narration line. make-voice.mjs turns each
   line into audio/vo/<id>.wav; record.mjs plays the steps and starts each
   line at the moment its step begins. `say` is what Kokoro reads aloud;
   `caption` (when given) is what appears on screen instead. */

export const TITLE = "Taskify · Login Module Test Cases";

export const CASES = [
  { name: "Valid login",     input: "Correct email + password",        expected: "User logs in successfully" },
  { name: "Wrong password",  input: "Correct email + wrong password",  expected: "Error message appears" },
  { name: "Empty fields",    input: "Leave email/password empty",      expected: "Validation message appears" },
  { name: "Invalid email",   input: "abc123",                          expected: "\"Invalid email\" message appears" },
  { name: "Forgot password", input: "Click \"Forgot Password\"",       expected: "Password-reset process starts" }
];

export const NARRATION = [
  { id: "intro",
    say: "This video tests the login module of Taskify, the U.M.P. student marketplace. We run five test cases on a local practice copy of the system, signed in with a registered U.M.P. student account, and compare each actual result with the expected result.",
    caption: "This video tests the login module of Taskify, the UMP student marketplace. We run five test cases on a local practice copy of the system, signed in with a registered UMP student account, and compare each actual result with the expected result." },

  { id: "tc1",
    say: "Test case one: valid login. We enter the correct email address and the correct password, then click Sign In." },
  { id: "tc1r",
    say: "Taskify confirms the login and opens the student's dashboard. The user logged in successfully, so test case one passes. We log out before the next test." },

  { id: "tc2",
    say: "Test case two: wrong password. We use the same correct email address, but type a wrong password." },
  { id: "tc2r",
    say: "An error message appears: invalid email or password, and the user stays on the login page. It deliberately doesn't say which one was wrong, so nobody can use it to find out who has an account. Test case two passes." },

  { id: "tc3",
    say: "Test case three: empty fields. We leave both the email and the password empty, and click Sign In." },
  { id: "tc3r",
    say: "Validation messages appear under both fields, asking for the email and the password, and nothing is sent to the server. Test case three passes." },

  { id: "tc4",
    say: "Test case four: invalid email. In the email field we type A, B, C, one, two, three, which is not an email address, and fill in a password as normal.",
    caption: "Test case four: invalid email. In the email field we type abc123, which is not an email address, and fill in a password as normal." },
  { id: "tc4r",
    say: "An invalid email message appears under the email field, with an example of the correct format. Test case four passes." },

  { id: "tc5",
    say: "Test case five: forgot password. On the login page, we click Forgot password, enter the account's email address, and ask for a reset link." },
  { id: "tc5a",
    say: "Taskify confirms that a reset link has been sent. On this practice copy, emails are printed in the server's terminal instead of being sent, so we take the reset link from there." },
  { id: "tc5b",
    say: "The link opens the reset password page. We choose a new password, confirm it, and save." },
  { id: "tc5c",
    say: "Finally, we log in with the new password, and it works. The password reset process started and completed, so test case five passes." },

  { id: "outro",
    say: "All five test cases passed. That concludes the testing of the Taskify login module." }
];
