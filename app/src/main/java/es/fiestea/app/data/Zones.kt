package es.fiestea.app.data

/** Zona elegida a mano por el usuario (una provincia), en vez de usar el GPS. */
data class Zone(val name: String, val position: GeoPos)

/** Provincias de España con las coordenadas de su capital. */
object Zones {
    val all: List<Zone> = listOf(
        Zone("A Coruña", GeoPos(43.3623, -8.4115)),
        Zone("Álava", GeoPos(42.8467, -2.6716)),
        Zone("Albacete", GeoPos(38.9943, -1.8585)),
        Zone("Alicante", GeoPos(38.3452, -0.4810)),
        Zone("Almería", GeoPos(36.8340, -2.4637)),
        Zone("Asturias", GeoPos(43.3619, -5.8494)),
        Zone("Ávila", GeoPos(40.6565, -4.6818)),
        Zone("Badajoz", GeoPos(38.8794, -6.9707)),
        Zone("Barcelona", GeoPos(41.3874, 2.1686)),
        Zone("Bizkaia", GeoPos(43.2630, -2.9350)),
        Zone("Burgos", GeoPos(42.3439, -3.6969)),
        Zone("Cáceres", GeoPos(39.4753, -6.3724)),
        Zone("Cádiz", GeoPos(36.5271, -6.2886)),
        Zone("Cantabria", GeoPos(43.4623, -3.8100)),
        Zone("Castellón", GeoPos(39.9864, -0.0513)),
        Zone("Ceuta", GeoPos(35.8894, -5.3213)),
        Zone("Ciudad Real", GeoPos(38.9848, -3.9274)),
        Zone("Córdoba", GeoPos(37.8882, -4.7794)),
        Zone("Cuenca", GeoPos(40.0704, -2.1374)),
        Zone("Gipuzkoa", GeoPos(43.3183, -1.9812)),
        Zone("Girona", GeoPos(41.9794, 2.8214)),
        Zone("Granada", GeoPos(37.1773, -3.5986)),
        Zone("Guadalajara", GeoPos(40.6326, -3.1602)),
        Zone("Huelva", GeoPos(37.2614, -6.9447)),
        Zone("Huesca", GeoPos(42.1401, -0.4089)),
        Zone("Illes Balears", GeoPos(39.5696, 2.6502)),
        Zone("Jaén", GeoPos(37.7796, -3.7849)),
        Zone("La Rioja", GeoPos(42.4627, -2.4450)),
        Zone("Las Palmas", GeoPos(28.1235, -15.4363)),
        Zone("León", GeoPos(42.5987, -5.5671)),
        Zone("Lleida", GeoPos(41.6176, 0.6200)),
        Zone("Lugo", GeoPos(43.0097, -7.5568)),
        Zone("Madrid", GeoPos(40.4168, -3.7038)),
        Zone("Málaga", GeoPos(36.7213, -4.4214)),
        Zone("Melilla", GeoPos(35.2923, -2.9381)),
        Zone("Murcia", GeoPos(37.9922, -1.1307)),
        Zone("Navarra", GeoPos(42.8125, -1.6458)),
        Zone("Ourense", GeoPos(42.3358, -7.8639)),
        Zone("Palencia", GeoPos(42.0095, -4.5288)),
        Zone("Pontevedra", GeoPos(42.4310, -8.6444)),
        Zone("Salamanca", GeoPos(40.9701, -5.6635)),
        Zone("Santa Cruz de Tenerife", GeoPos(28.4636, -16.2518)),
        Zone("Segovia", GeoPos(40.9429, -4.1088)),
        Zone("Sevilla", GeoPos(37.3891, -5.9845)),
        Zone("Soria", GeoPos(41.7666, -2.4790)),
        Zone("Tarragona", GeoPos(41.1189, 1.2445)),
        Zone("Teruel", GeoPos(40.3456, -1.1065)),
        Zone("Toledo", GeoPos(39.8628, -4.0273)),
        Zone("Valencia", GeoPos(39.4699, -0.3763)),
        Zone("Valladolid", GeoPos(41.6523, -4.7245)),
        Zone("Zamora", GeoPos(41.5035, -5.7446)),
        Zone("Zaragoza", GeoPos(41.6488, -0.8891)),
    )

    fun byName(name: String?): Zone? = all.firstOrNull { it.name == name }
}
