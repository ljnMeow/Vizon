from __future__ import annotations

from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("auth_api", "0001_initial"),
    ]

    operations = [
        migrations.DeleteModel(
            name="RevokedToken",
        ),
    ]

