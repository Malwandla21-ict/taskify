/*
  Feature switches for things that depend on university policy or on
  decisions that haven't been made yet. Changing a value here changes both
  the server (which refuses the feature) and the website (which hides it —
  it reads these from GET /api/features).

  endorsements — lecturers "recommending" students and their listings.
    OFF by default: whether, and how, lecturers may endorse students on a
    marketplace hasn't been agreed with the university. Existing
    endorsements stay in the database but aren't shown or added to.

  feedback — the "Help shape Taskify" form (ideas, problems, consultation,
    usability testing). Sending feedback never gives anyone extra
    permissions.

  The Campus Marketplace's institutional listings have their own switch in
  config/marketplace.js.
*/
module.exports = {
  endorsements: false,
  feedback: true
};
