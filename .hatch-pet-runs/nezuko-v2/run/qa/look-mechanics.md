# Nezuko Look Mechanics

Nezuko is a humanoid pixel-art pet. Her feet and lower torso remain anchored while her pink eyes lead each gaze. The eyelids and brows reshape subtly, the head and neck turn or pitch a small amount, and the upper torso follows by one restrained step. Her bamboo muzzle remains rigidly attached across the face, becoming slightly foreshortened on left/right turns. Her long hair and orange tips follow the head with slight lag while preserving their volume and pixel silhouette; the bow stays attached to the same side of her head.

Motion budget: every 22.5-degree step changes eye direction first, then head angle and upper-body follow-through by a similar small amount. Facial proportions, bamboo width, body scale, baseline, costume, and lower-body registration stay stable. Never rotate, skew, stretch, or warp the whole sprite.

- 000 up: pupils and eyelids lift; chin and bamboo angle rise slightly; more lower face/neck is occluded while the hair falls behind the shoulders.
- 090 screen-right: eyes, nose center, bamboo perspective, and head turn toward screen-right; more of the screen-left cheek and hair mass is visible, with the far cheek slightly occluded.
- 180 down: pupils and eyelids lower; chin and bamboo dip; upper face is slightly foreshortened and hair tips settle forward.
- 270 screen-left: eyes, nose center, bamboo perspective, and head turn toward screen-left; more of the screen-right cheek and hair mass is visible, with the far cheek slightly occluded.

The sixteen poses form one continuous clockwise loop. The bamboo, bow, hair, hands, clothing, and limbs remain physically attached and never jump sides. No new eye layer, props, effects, shadows, labels, or guide marks.
