/*
  Campus Marketplace settings (the area that used to be "Events").

  University policy on institutional selling (farm produce, surplus, lost
  property, departmental opportunities) hasn't been set yet, so:
    - those categories always need an admin check before they're shown,
      plus a note of who authorised the sale (events.listing_authority);
    - an approved listing is labelled "Reviewed institutional listing" —
      never "official" or "endorsed by UMP".
  Set institutionalListingsEnabled to false to stop new institutional
  listings altogether (e.g. if the university says no).

  adminsOnlyPosting — only Taskify admins (with two-factor sign-in) can
  post or edit Campus Marketplace listings. Everyone can still browse
  and mark themselves as going. Students sell things through Sales and
  Rentals instead. Listings posted before this keep showing until they
  end, and their organizers can still delete them.
*/
module.exports = {
  institutionalListingsEnabled: true,
  adminsOnlyPosting: true
};
