const GROUP_ID = "815857204";

const GAMEPASSES = {
  "1956218286": {
    name: "Trainee Store Colleague",
    rankId: 10
  },

  "1955137512": {
    name: "Trainee Security Officer",
    rankId: 15
  },

  "1954075783": {
    name: "Junior Store Colleague",
    rankId: 30
  },

  "1954127734": {
    name: "Junior Security Colleague",
    rankId: 45
  },

  "1952302041": {
    name: "Senior Store Colleague",
    rankId: 76
  },

  "1955611419": {
    name: "Senior Security Officer",
    rankId: 77
  },

  "1955293554": {
    name: "Team Leader",
    rankId: 90
  },

  "1952818064": {
    name: "Deputy Store Manager",
    rankId: 120
  }
};

export default async function handler(req, res) {
  /*
   * Only allow POST requests.
   */
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed."
    });
  }

  /*
   * Check API secret.
   *
   * This is another layer of protection between
   * your Roblox game and the Vercel endpoint.
   */
  const suppliedSecret = req.headers["x-api-secret"];

  if (
    !process.env.GAME_API_SECRET ||
    suppliedSecret !== process.env.GAME_API_SECRET
  ) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized."
    });
  }

  /*
   * Make sure the request contains JSON.
   */
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({
      success: false,
      message: "Invalid request body."
    });
  }

  const userId = String(req.body.userId || "");
  const gamepassId = String(req.body.gamepassId || "");

  /*
   * Validate UserId.
   */
  if (!/^\d+$/.test(userId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Roblox UserId."
    });
  }

  /*
   * Validate gamepass.
   */
  const pass = GAMEPASSES[gamepassId];

  if (!pass) {
    return res.status(400).json({
      success: false,
      message: "This gamepass is not authorised."
    });
  }

  /*
   * Roblox Open Cloud API key.
   */
  const robloxApiKey = process.env.ROBLOX_API_KEY;

  if (!robloxApiKey) {
    console.error("ROBLOX_API_KEY is missing.");

    return res.status(500).json({
      success: false,
      message: "Roblox API configuration is missing."
    });
  }

  try {
    /*
     * -------------------------------------------------------
     * STEP 1
     * Check that the Roblox user actually exists.
     * -------------------------------------------------------
     */

    const userResponse = await fetch(
      `https://users.roblox.com/v1/users/${userId}`
    );

    if (!userResponse.ok) {
      return res.status(404).json({
        success: false,
        message: "Roblox user could not be found."
      });
    }

    const user = await userResponse.json();

    /*
     * -------------------------------------------------------
     * STEP 2
     * Check the user's membership of your group.
     * -------------------------------------------------------
     */

    const membershipResponse = await fetch(
      `https://apis.roblox.com/cloud/v2/users/${userId}/groups/${GROUP_ID}/membership`,
      {
        method: "GET",
        headers: {
          "x-api-key": robloxApiKey,
          "Content-Type": "application/json"
        }
      }
    );

    if (!membershipResponse.ok) {
      const errorText = await membershipResponse.text();

      console.error(
        "Membership lookup failed:",
        membershipResponse.status,
        errorText
      );

      return res.status(502).json({
        success: false,
        message: "Could not verify Roblox group membership."
      });
    }

    const membership = await membershipResponse.json();

    /*
     * -------------------------------------------------------
     * STEP 3
     * Make sure they are actually in the group.
     * -------------------------------------------------------
     */

    if (!membership || !membership.id) {
      return res.status(400).json({
        success: false,
        message: "You must be a member of the Parkside Shopping group first."
      });
    }

    /*
     * -------------------------------------------------------
     * STEP 4
     * Check current role.
     * -------------------------------------------------------
     */

    const currentRoleId =
      membership.role &&
      membership.role.id
        ? Number(membership.role.id)
        : null;

    /*
     * Don't attempt to lower someone's rank.
     */
    if (
      currentRoleId !== null &&
      currentRoleId >= Number(pass.rankId)
    ) {
      return res.status(400).json({
        success: false,
        message: "You already have this rank or a higher rank."
      });
    }

    /*
     * -------------------------------------------------------
     * STEP 5
     * Assign the role.
     * -------------------------------------------------------
     */

    const updateResponse = await fetch(
      `https://apis.roblox.com/cloud/v2/groups/${GROUP_ID}/memberships/${membership.id}`,
      {
        method: "PATCH",
        headers: {
          "x-api-key": robloxApiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          role: {
            id: String(pass.rankId)
          }
        })
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();

      console.error(
        "Role update failed:",
        updateResponse.status,
        errorText
      );

      return res.status(502).json({
        success: false,
        message: "Roblox rejected the role update."
      });
    }

    /*
     * -------------------------------------------------------
     * SUCCESS
     * -------------------------------------------------------
     */

    console.log(
      `[Parkside] Ranked ${user.name} (${userId}) to ${pass.name} (${pass.rankId})`
    );

    return res.status(200).json({
      success: true,
      message: "Role successfully assigned.",
      username: user.name,
      userId: userId,
      role: pass.name,
      rankId: pass.rankId
    });

  } catch (error) {
    console.error("Unexpected error:", error);

    return res.status(500).json({
      success: false,
      message: "An unexpected server error occurred."
    });
  }
}
